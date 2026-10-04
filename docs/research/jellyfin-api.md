# Jellyfin API - live check on 12.1 and 10.11

Research date: 2026-10-02. Every endpoint in CLAUDE.md §5 checked with curl against `dev/jellyfin` (12.1.0 on `:8096`, 10.11.11 on `:8097`), dev user `test` unless noted. Server config at defaults. Rules derived from this live in CLAUDE.md §2 / §5 / §6; this file keeps the evidence.

Item ids are identical on both servers (same media paths), so test fixtures can share ids.

## TL;DR

| #   | Finding                                                                                                                                                                             | Impact                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | All §5 endpoints exist on both versions, none `deprecated` in OpenAPI                                                                                                               | Plan holds                                                     |
| 2   | 12.1 rejects `X-Emby-Token`, `X-MediaBrowser-Token`, `?api_key=` and the `Emby` scheme, but **accepts `?ApiKey=`**. 10.11 accepts all                                               | Header auth only (§10 bans tokens in URLs)                     |
| 3   | PlaybackInfo `DeliveryUrl` for external subs contains `?ApiKey=<access token>` on both                                                                                              | Build subtitle URLs in the client; never log `DeliveryUrl`     |
| 4   | Unknown / revoked / missing / malformed token = **401** on every authed endpoint, both versions. 400 only for a bad `mediaSourceId` or missing client header fields                 | A global 401 handler is enough                                 |
| 5   | Unauthenticated on both: `/Videos/{id}/stream` (static and non-static), `/Images`, `/Subtitles/.../Stream.*`                                                                        | Revocation can't be detected from playback (mpv test plan I10) |
| 6   | No DeviceProfile -> everything direct plays. A minimal explicit profile needs `MaxStreamingBitrate` and subtitle profiles with **Embed and External**                               | Profile below                                                  |
| 7   | `HEAD /Items/{id}/Download` = **405**. GET has Accept-Ranges, Content-Length, Last-Modified, no ETag. Range 206, `If-Range` by date honoured                                        | Downloader must not HEAD                                       |
| 8   | Same user + same DeviceId re-login revokes the older token. Different users on one DeviceId: 10.11 merges them into **one session**, 12.1 keeps them apart                          | Confirms per-account DeviceId                                  |
| 9   | `POST /UserItems/{id}/UserData` sets `PlaybackPositionTicks`, `LastPlayedDate`, `Played` exactly as sent, partial bodies OK                                                         | Offline sync route (§6)                                        |
| 10  | Server resume rules apply on every `Progress`: < 5% -> 0, ≥ 90% -> Played, items < 300s never get a resume point. `LastPlayedDate` + `PlayCount` are set only at `Sessions/Playing` | Client mirrors the rules offline                               |
| 11  | 12.1 `/UserItems/Resume` returns Season + Series rows besides episodes; `mediaTypes=Video` fixes it                                                                                 | Add param                                                      |
| 12  | `/Items/00000000000000000000000000000000` returns 200 with the root "Media Folders"                                                                                                 | Guard empty ids                                                |

## 1. Endpoint matrix

Status with a valid token unless stated.

| Endpoint                                                 | 12.1                      | 10.11      | Notes                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /System/Info/Public`                                | 200                       | 200        | No auth. `{Version, ProductName, ServerName, Id, LocalAddress, StartupWizardCompleted}`. `Version` is plain `major.minor.patch` - compare numerically against 10.10.7                                                      |
| `GET /Users/Public`                                      | 200 `[]`                  | 200 `[]`   | Hidden users (`Policy.IsHidden`) -> empty. Server screen must always offer a manual username                                                                                                                               |
| `POST /Users/AuthenticateByName`                         | 200 / 401 bad pw          | same       | Needs `Authorization: MediaBrowser Client, Device, DeviceId, Version` (no token) - **400** without the header or without Device / DeviceId. Response `{User, SessionInfo, AccessToken, ServerId}`                          |
| `GET /QuickConnect/Enabled`                              | 200 `true`                | 200 `true` | No auth                                                                                                                                                                                                                    |
| `POST /QuickConnect/Initiate`                            | 200                       | 200        | Client header (no token), 400 without. `{Secret, Code (6 digits), Authenticated:false, ...}`                                                                                                                               |
| `GET /QuickConnect/Initiate`                             | **405**                   | 200        | 10.11 still answers GET. Always POST                                                                                                                                                                                       |
| `GET /QuickConnect/Connect?secret=`                      | 200                       | 200        | No auth. `Authenticated` false -> true after approval. Unknown secret 404                                                                                                                                                  |
| `POST /QuickConnect/Authorize?code=[&userId=]`           | 200 `true`                | 200 `true` | Authed user approves for self; admin can approve for another user. Lets tests run Quick Connect headlessly                                                                                                                 |
| `POST /Users/AuthenticateWithQuickConnect` `{Secret}`    | 200 / 404 before approval | same       | Same response as AuthenticateByName. Secret reusable until it expires                                                                                                                                                      |
| `POST /Sessions/Logout`                                  | 204                       | 204        | Token dead immediately (401), device removed from `/Devices`                                                                                                                                                               |
| `GET /UserViews?userId=`                                 | 200                       | 200        | `userId` optional (from token). `CollectionType` movies / tvshows                                                                                                                                                          |
| `GET /UserItems/Resume`                                  | 200                       | 200        | 12.1 also returns `Season` + `Series` rows - add `mediaTypes=Video`. Sorted by `LastPlayedDate` desc; lists anything with position > 0                                                                                     |
| `GET /Shows/NextUp`                                      | 200                       | 200        | Episode after the **highest-index played** episode, not the latest played. Needs `LastPlayedDate` on the played episode. `nextUpDateCutoff` filters on it. 10.11-only `disableFirstEpisode` removed in 12.1                |
| `GET /Items/Latest?parentId=`                            | 200 array                 | 200 array  | **Bare array**, not `{Items}`. TV: 12.1 returns the `Series`, 10.11 the latest `Episode` (even with `groupItems=true`)                                                                                                     |
| `GET /Items` grid                                        | 200                       | 200        | `startIndex` / `limit` + `TotalRecordCount`. `sortBy` + `sortOrder` (comma lists OK); unknown `sortBy` silently ignored. `filters=IsUnplayed` == `isPlayed=false`. 12.1 adds `audioLanguages`, `subtitleLanguages` filters |
| `GET /Items?searchTerm=`                                 | 200                       | 200        | Name substrings incl. episodes                                                                                                                                                                                             |
| `GET /Items/{id}?userId=`                                | 200                       | 200        | `MediaSources`, `MediaStreams`, `UserData`, `ImageTags`, `BackdropImageTags`, `Chapters`, `People`, `CanDownload`. Unknown id 404, non-guid 400, **Guid.Empty -> 200 root folder**. Another user's `userId` -> 403         |
| `GET /Shows/{id}/Seasons`, `/Episodes?seasonId=`         | 200                       | 200        | Episodes carry `SeriesId`, `SeasonId`, `IndexNumber`, `ParentIndexNumber`, `UserData`                                                                                                                                      |
| `POST /Items/{id}/PlaybackInfo`                          | 200                       | 200        | `{MediaSources, PlaySessionId}`. See profile below                                                                                                                                                                         |
| `GET /Videos/{id}/stream?static=true&mediaSourceId=`     | 206 / HEAD 200            | same       | **No auth.** HEAD works. `mediaSourceId` optional; another item's msId -> 400                                                                                                                                              |
| `GET /Videos/{id}/{msId}/Subtitles/{index}/Stream.{fmt}` | 200                       | 200        | **No auth.** `srt`, `subrip`, `vtt`, `ass` all convert, external and embedded index. Bad index -> 500                                                                                                                      |
| `POST /Sessions/Playing`, `/Progress`, `/Stopped`        | 204                       | 204        | Visible in admin `/Sessions` immediately. `Stopped` accepted without `Playing` and without `PlaySessionId`                                                                                                                 |
| `POST /UserPlayedItems/{id}[?datePlayed=]`               | 200 UserData              | same       | Played, position 0, PlayCount +1, `LastPlayedDate` = `datePlayed` (server now if omitted). Any ISO format; no zone = UTC                                                                                                   |
| `DELETE /UserPlayedItems/{id}`                           | 200 UserData              | same       | Resets Played, PlayCount, position, `LastPlayedDate`                                                                                                                                                                       |
| `/UserPlayedItems/{seasonId or seriesId}`                | 200 UserData              | same       | Marks / unmarks every episode inside; the series counts as played once all are. Unknown id: **404 on 12.1, 500 on 10.11**; non-guid 400                                                                                    |
| `POST` / `DELETE /UserFavoriteItems/{id}`                | 200 UserData              | same       | `IsFavorite` only; idempotent. Unknown id 404 (12.1) / 500 (10.11)                                                                                                                                                         |
| `GET /Items/{id}/Download`                               | 200 / 206                 | same       | Unauth 401, unknown 404, folder 400, **HEAD 405**. See download section                                                                                                                                                    |
| `GET /Items/{id}/Images/{type}`                          | 200                       | 200        | **No auth.** See images section                                                                                                                                                                                            |
| `GET` / `POST /UserItems/{id}/UserData`                  | 200                       | 200        | Another user's `userId` -> 403. Legacy `/Users/{userId}/Items/{id}/UserData` is gone on both                                                                                                                               |

OpenAPI (`/api-docs/openapi.json`): 12.1 deprecations are music / Startup / Trailers only. 12.1 drops HLS paths from OpenAPI but `master.m3u8` still answers - irrelevant for direct play.

### PlaybackInfo DeviceProfile (direct play everything)

| Profile                                              | Result (both versions, 10 test items)                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| no `DeviceProfile`                                   | all `SupportsDirectPlay: true`, but `SupportsTranscoding: true` and server defaults |
| `{}`                                                 | all false                                                                           |
| `DirectPlayProfiles:[{Type:Video}]`                  | 4K (12 Mbps), sidecar SRT, multi-audio / multi-subs fail                            |
| + Embed subtitle profiles                            | 4K + sidecar SRT fail                                                               |
| + Embed + External                                   | only 4K fails (bitrate)                                                             |
| + `MaxStreamingBitrate` (or `?maxStreamingBitrate=`) | **all true**, no `TranscodingUrl`                                                   |
| `MaxStaticBitrate` alone                             | 4K still fails - `MaxStreamingBitrate` is what counts                               |

Minimal working body:

```json
{
  "UserId": "<userId>",
  "DeviceProfile": {
    "MaxStreamingBitrate": 400000000,
    "DirectPlayProfiles": [{ "Type": "Video" }],
    "SubtitleProfiles": [
      { "Format": "srt", "Method": "Embed" },
      { "Format": "srt", "Method": "External" },
      { "Format": "subrip", "Method": "Embed" },
      { "Format": "subrip", "Method": "External" },
      { "Format": "ass", "Method": "Embed" },
      { "Format": "ass", "Method": "External" },
      { "Format": "ssa", "Method": "Embed" },
      { "Format": "ssa", "Method": "External" },
      { "Format": "vtt", "Method": "Embed" },
      { "Format": "vtt", "Method": "External" },
      { "Format": "webvtt", "Method": "Embed" },
      { "Format": "webvtt", "Method": "External" },
      { "Format": "pgssub", "Method": "Embed" },
      { "Format": "dvdsub", "Method": "Embed" },
      { "Format": "dvbsub", "Method": "Embed" },
      { "Format": "sub", "Method": "Embed" }
    ]
  }
}
```

- No `TranscodingProfiles` -> when direct play is refused there is **no ErrorCode and no TranscodingUrl**, only `SupportsDirectPlay:false`. The client checks the flag and shows its own error.
- External sub streams: `IsExternal: true`, `DeliveryMethod: "External"`, `DeliveryUrl` with `ApiKey=<token>`. Build `/Videos/{id}/{msId}/Subtitles/{index}/Stream.srt` yourself; no token needed.
- 400 Mbps covers UHD remuxes (~80-130 Mbps); higher values not tested.

### Download (`/Items/{id}/Download`, both versions identical)

| Check                         | Result                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| HEAD                          | **405**                                                                                                                             |
| GET headers                   | `Content-Length`, `Content-Type: video/x-matroska`, `Accept-Ranges: bytes`, `Last-Modified`, `Content-Disposition` (UTF-8 filename) |
| ETag                          | absent                                                                                                                              |
| `Range: bytes=100-199` / `N-` | 206, `Content-Range: bytes 100-199/<total>`                                                                                         |
| Range past EOF                | 416, `Content-Range: bytes */<total>`                                                                                               |
| `If-Range: <Last-Modified>`   | 206                                                                                                                                 |
| `If-Range: <older date>`      | 200 full body (file changed -> restart)                                                                                             |
| `If-Range: <newer date>`      | 206 (lenient)                                                                                                                       |
| `If-Range: "etag"`            | 206 - etag ignored                                                                                                                  |
| `If-Modified-Since: <LM>`     | 304                                                                                                                                 |

### Images (both)

- `tag=` present -> `Cache-Control: public, max-age=31536000` (12.1 adds `immutable` + `ETag: "<tag>"`). No tag -> `Cache-Control: public`. A bogus tag still returns 200.
- `fillWidth` honoured, aspect kept. `format=Webp` or `Accept: image/webp` -> webp.
- Missing image type -> 404 (`... does not have an image of type Backdrop`); unknown item -> 404. The generated test series has no images and episodes / movies have Primary only - fallback UI needed.

## 2. Auth failure semantics

Checked on UserViews, Items/{id}, Users/Me, PlaybackInfo, stream (Range 0-0), Download, Image, external sub, System/Info/Public, System/Info.

| Variant                                                          | 12.1                        | 10.11 |
| ---------------------------------------------------------------- | --------------------------- | ----- |
| full `MediaBrowser ... Token=` header                            | 200 (stream 206)            | same  |
| `MediaBrowser Token="..."` only                                  | 200                         | same  |
| `X-Emby-Token` / `X-MediaBrowser-Token`                          | **401** on authed endpoints | 200   |
| `?api_key=`                                                      | **401**                     | 200   |
| `?ApiKey=`                                                       | **200**                     | 200   |
| `Emby ...` scheme                                                | **401**                     | 200   |
| no auth / unknown / malformed / `Bearer` / header without Token  | 401                         | 401   |
| revoked (admin `DELETE /Devices?id=`) or after `Sessions/Logout` | 401 (also `Progress` POST)  | 401   |
| any of the above on stream / Image / ext sub / Info/Public       | 206 / 200 (no auth)         | same  |

- Valid token + another user's `userId` -> **403**.
- Only 400s seen: bad `mediaSourceId` on stream; login / Quick Connect without Device / DeviceId. The mpv test plan's earlier "unknown token -> 400" was not reproduced - most likely the I1 header split or a bad msId.
- Non-static `/Videos/{id}/stream` with an unknown token also returns 200 on both (unauthenticated remux) - server issue.
- The token is not bound to the DeviceId in the header.

## 3. DeviceId behaviour

| Case                               | 12.1                            | 10.11                                            |
| ---------------------------------- | ------------------------------- | ------------------------------------------------ |
| Same user, same DeviceId, 2 logins | 1st token **401**, 2nd 200      | same                                             |
| Same user, different DeviceIds     | both 200, 2 sessions            | same                                             |
| Different users, same DeviceId     | both tokens 200, **2 sessions** | both tokens 200, **1 session** (last login wins) |

Per-account DeviceId is right. Re-login on the same account intentionally kills the previous token, so "add account" for an existing account must replace it, not duplicate it.

## 4. Resume and progress reporting

Test file: 7-min `Resume Test (2026)` from `dev/jellyfin/make-test-media.sh` (420 s; server thresholds 21 s / 378 s). Server config defaults, identical on both versions:

| Key                        | Value | On a 420 s item                                                              |
| -------------------------- | ----- | ---------------------------------------------------------------------------- |
| `MinResumePct`             | 5     | < 21.0 s -> position dropped                                                 |
| `MaxResumePct`             | 90    | > 378.0 s -> Played                                                          |
| `MinResumeDurationSeconds` | 300   | items < 5 min never get a resume point (`Playing` already marks them Played) |

Online `Playing@0` -> `Progress@X` -> `Stopped@X` (same PlaySessionId), 12.1; 10.11 identical:

| Stop at        | After `Playing@0`             | After `Progress@X` | After `Stopped@X`          | In Resume |
| -------------- | ----------------------------- | ------------------ | -------------------------- | --------- |
| 2:00 (28.6%)   | pos 0, PlayCount 1, LPD = now | pos 120 s          | pos 120 s, Played false    | yes       |
| 0:10 (2.4%)    | same                          | pos 0              | pos 0                      | no        |
| 0:21 (4.9997%) | same                          | pos 0              | pos 0                      | no        |
| 0:22 (5.24%)   | same                          | pos 22 s           | pos 22 s                   | yes       |
| 6:18 (89.996%) | same                          | pos 378 s          | pos 378 s                  | yes       |
| 6:19 (90.2%)   | same                          | pos 0, **Played**  | pos 0, Played, PlayCount 1 | no        |

- Thresholds apply on **every `Progress`**, not only `Stopped`.
- `LastPlayedDate` (LPD) and `PlayCount +1` are set **only at `Playing`** (session start). `Progress` / `Stopped` never touch them.
- `Stopped` alone (no `Playing`, no PlaySessionId) on a clean item: 204, position stored, PlayCount 0, **LPD null**.

## 5. Offline progress sync

Local state in the tests: position 3:00, `lastPlayedAt` = now - 1 h.

| Approach                                                                                | Result                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /UserItems/{id}/UserData {PlaybackPositionTicks, LastPlayedDate}` on a clean item | Stored exactly (LPD to the second), Played false, PlayCount unchanged. In Resume at 3:00                                                                     |
| Same POST on top of **newer** server progress                                           | **Overwritten** with the older local data. Client must GET and compare `LastPlayedDate` first                                                                |
| `GET` first, server LPD newer -> skip                                                   | Server state kept (correct)                                                                                                                                  |
| `POST /UserPlayedItems/{id}?datePlayed=`                                                | Played, pos 0, PlayCount +1, LPD = `datePlayed` - even when older than the server value. Removed from Resume                                                 |
| Replay `Stopped` only                                                                   | Position stored, **LPD unchanged** (old value or null). Watched (≥ 90%) -> Played with **LPD null** -> invisible to NextUp. Overwrites newer server progress |
| Replay `Playing` + `Stopped`                                                            | LPD = **replay time**, PlayCount +1 - the offline timestamp is lost                                                                                          |
| UserData `{Played:true}`                                                                | Played flipped, position kept, PlayCount and LPD untouched -> missing from NextUp, can show in Resume while watched                                          |

`POST /UserItems/{id}/UserData` validation - stored as sent, no server rules:

| Body                                                             | Status | Result                                                         |
| ---------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| partial (`PlaybackPositionTicks` or `LastPlayedDate` only), `{}` | 200    | Only sent fields change                                        |
| position > runtime / negative / < 5% / > 90%                     | 200    | Stored as-is (> runtime shows in Resume, negative doesn't)     |
| `LastPlayedDate` in the future                                   | 200    | Stored                                                         |
| `LastPlayedDate: null`                                           | 200    | Ignored - LPD can only be cleared by `DELETE /UserPlayedItems` |
| `LastPlayedDate: "garbage"`, position `"abc"`                    | 400    | No change                                                      |
| `PlayCount: 5`                                                   | 200    | Stored                                                         |
| `PlayedPercentage: 50`                                           | 200    | Ignored (derived from position)                                |
| unknown item                                                     | 404    |                                                                |

DTO (`UpdateUserItemDataDto`, both versions): `Rating, PlayedPercentage, UnplayedItemCount, PlaybackPositionTicks, PlayCount, IsFavorite, Likes, LastPlayedDate, Played, Key, ItemId`.

Ordering: `/UserItems/Resume` sorts by LPD desc, so offline timestamps pushed via UserData sort correctly. `/Shows/NextUp` follows the highest-index played episode (E2 played 3 h ago + E1 1 h ago -> E03).

Resulting flow (CLAUDE.md §6 Sync): `GET` UserData -> server newer wins -> else `UserPlayedItems?datePlayed=` for watched or `UserData {PlaybackPositionTicks, LastPlayedDate}` for progress. Last writer wins on LPD.

### Edge cases

- The server only records session **start** time. A long online session on another device that started before an offline session loses to it. Rare, accepted with last-writer-wins; Jellyfin exposes no "last updated" field.
- `UserPlayedItems` with an older `datePlayed` moves LPD backwards - guarded only by the GET check.
- Device clock far in the future would always win and pin the item to the top of Resume - clamp `lastPlayedAt <= now`.
- Use the **local session start** as `lastPlayedAt` to match the server (LPD = `Playing` time).
- Offline rewatch of an already played item below 90%: POST UserData leaves Played true. Whether to also send `Played:false` is open (CLAUDE.md §11).
- Items < 300 s: online they become Played at `Playing`; offline rules should mirror this.
- Server thresholds can differ from defaults but are readable only by admins (`/System/Configuration`) - hardcode the defaults.

## 6. curl examples

```bash
S=http://localhost:8096
DEV='MediaBrowser Client="Rillwood", Device="iPhone", DeviceId="<deviceId>", Version="0.1.0"'
AUTH="Authorization: $DEV, Token=\"<token>\""

curl $S/System/Info/Public
curl -X POST -H "Authorization: $DEV" -H 'Content-Type: application/json' \
  -d '{"Username":"test","Pw":"test-rillwood"}' $S/Users/AuthenticateByName
# Quick Connect
curl -X POST -H "Authorization: $DEV" $S/QuickConnect/Initiate            # -> Secret, Code
curl "$S/QuickConnect/Connect?secret=<secret>"                             # poll Authenticated
curl -X POST -H "$AUTH_OTHER_DEVICE" "$S/QuickConnect/Authorize?code=<code>"  # approve (headless test)
curl -X POST -H "Authorization: $DEV" -H 'Content-Type: application/json' \
  -d '{"Secret":"<secret>"}' $S/Users/AuthenticateWithQuickConnect
curl -X POST -H "$AUTH" $S/Sessions/Logout
# Browse
curl -H "$AUTH" "$S/UserViews"
curl -H "$AUTH" "$S/UserItems/Resume?mediaTypes=Video&limit=20"
curl -H "$AUTH" "$S/Shows/NextUp?limit=20"
curl -H "$AUTH" "$S/Items/Latest?parentId=<viewId>&limit=20"
curl -H "$AUTH" "$S/Items?parentId=<viewId>&includeItemTypes=Movie,Series&recursive=true&sortBy=SortName&sortOrder=Ascending&filters=IsUnplayed&startIndex=0&limit=50&fields=Overview,PrimaryImageAspectRatio"
curl -H "$AUTH" "$S/Items?searchTerm=hevc&includeItemTypes=Movie,Series,Episode&recursive=true&limit=50"
curl -H "$AUTH" "$S/Items/<id>"
curl -H "$AUTH" "$S/Shows/<seriesId>/Episodes?seasonId=<seasonId>"
# Playback
curl -X POST -H "$AUTH" -H 'Content-Type: application/json' -d @profile.json "$S/Items/<id>/PlaybackInfo"
curl -H 'Authorization: MediaBrowser Token="<token>"' -H 'Range: bytes=0-' "$S/Videos/<id>/stream?static=true&mediaSourceId=<msId>"
curl -H 'Authorization: MediaBrowser Token="<token>"' "$S/Videos/<id>/<msId>/Subtitles/<index>/Stream.srt"
curl -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"ItemId":"<id>","MediaSourceId":"<msId>","PlaySessionId":"<psid>","PositionTicks":0,"PlayMethod":"DirectPlay","CanSeek":true}' $S/Sessions/Playing
curl -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"ItemId":"<id>","MediaSourceId":"<msId>","PlaySessionId":"<psid>","PositionTicks":400000000,"IsPaused":true,"EventName":"pause"}' $S/Sessions/Playing/Progress
curl -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"ItemId":"<id>","MediaSourceId":"<msId>","PlaySessionId":"<psid>","PositionTicks":600000000}' $S/Sessions/Playing/Stopped
# Offline sync
curl -H "$AUTH" "$S/UserItems/<id>/UserData"
curl -X POST -H "$AUTH" "$S/UserPlayedItems/<id>?datePlayed=2026-09-30T20:15:00Z"
curl -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"PlaybackPositionTicks":6000000000,"LastPlayedDate":"2026-09-30T20:15:00Z"}' "$S/UserItems/<id>/UserData"
# Reset a test item
curl -X DELETE -H "$AUTH" "$S/UserPlayedItems/<id>"
curl -X POST -H "$AUTH" -H 'Content-Type: application/json' -d '{"PlaybackPositionTicks":0}' "$S/UserItems/<id>/UserData"
# Download (resume)
curl -H "$AUTH" -H 'Range: bytes=1000000-' -H 'If-Range: <Last-Modified>' -o part "$S/Items/<id>/Download"
# Image
curl -o p.jpg "$S/Items/<id>/Images/Primary?fillWidth=300&quality=90&tag=<ImageTags.Primary>"
```

## 7. Open questions

- Quick Connect disabled path not tested. Server source suggests 401 on Initiate - gate the button on `/QuickConnect/Enabled`.
- 10.10.x not tested. `/UserItems/{id}/UserData` exists since 10.9 per server source; below 10.10.7 the app only warns.
- `maxStreamingBitrate` above 400 Mbps untested.
- Quick Connect secrets stay reusable after success until expiry (server behaviour) - note for security review.
- Cross-series NextUp ordering by LPD (needs a second test series).
- Online `Playing` on an already played item (decides the offline rewatch question).
