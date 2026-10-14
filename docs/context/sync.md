# Offline progress sync

Read before working on `src/sync.ts` or anything that writes playback progress offline. Tested against Jellyfin 12.1 + 10.11: [`docs/research/jellyfin-api.md`](../research/jellyfin-api.md).

## Record

- `useReporting` (`docs/context/player.md`) keeps a report that doesn't reach the server: known offline (`isOffline()`) → kept when queued (not after the 8 s timeout - the app may be killed meanwhile); a report failing with a network error → kept then. A server error (5xx) or 401 isn't kept. Any session, not only downloads (a stream that lost the network too).
- Queue: kv-store `sync` = `{version: 1, items: PendingProgress[]}`, one entry per `account:item` - not on the download, so a delete / offload doesn't lose it. `PendingProgress = {accountId, itemId, positionTicks, lastPlayedAt, watched}`.
- `lastPlayedAt` = local session start (ISO UTC; the server stamps LastPlayedDate at `Playing` too). Reports are numbered per session: a late failure never writes an older position over a newer one.
- Resume rules applied locally (`resumeRules`, server defaults - the real values are admin-only): < 5% → 0, ≥ 90% → watched + 0, items < 5 min are watched from 5%, unknown runtime → position as is. Runtime taken when the report is queued (by a late failure the player may be on the next episode).
- `watched` stays set while the entry is pending: a later rewatch below 90% keeps it (as online - see below).
- Back online in the session: a report the server got clears that session's entry (`clearProgress`, same `lastPlayedAt`), unless watched - that may come from an earlier session the server hasn't got.
- Offline: `useItem` (`item` and `saved`) and the Downloads tab's Play put the pending entry on the saved item (`withPendingProgress`: position, Played, LastPlayedDate), so the resume point and watched mark show before the replay.

## Replay

`syncProgress()` - the active account only (another account's server may be down, and a failing request would set the app-wide offline flag). Runs at launch, back from the background, on reconnect (`onReconnect`) and on an account switch; one run at a time, a call meanwhile runs again after. Skipped while known offline. Per entry, oldest `lastPlayedAt` first:

1. `GET /UserItems/{id}/UserData`. Server `LastPlayedDate` more than 1 min (`SAME_SESSION_MS`: clock skew, a session that started online) after `lastPlayedAt` → server wins: drop local.
2. Watched → `POST /UserPlayedItems/{id}?datePlayed=<lastPlayedAt>` (Played, position 0, PlayCount+1, LastPlayedDate).
3. Not watched, or watched with a resume point (a rewatch) → `POST /UserItems/{id}/UserData {PlaybackPositionTicks, LastPlayedDate: <lastPlayedAt>}` (stored as sent, no server validation - the rules above clamp).
4. 2xx → drop the entry (unless a newer one replaced it meanwhile - checked after the GET too). Network error / 401 → stop, keep the rest (retried on the next run / after signing in again). Other 4xx (404: item gone) → drop. 5xx or an answer that isn't JSON (a proxy page) → keep, go on.

Sent anything → `invalidate()` (resume points, Continue Watching, Next Up). Then pull (when the replay sent something, else at most every 10 min per account): `GET /Items?ids=<the account's downloaded items>&enableImages=false` (chunks of 100) and the server's UserData goes into each saved `item.json` (`writeSnapshotUserData`, written only when changed) - offline detail and offload read it.

A removed account's entries are dropped; a signed-out account's stay for when it signs in again.

## Rules

- Never replay `Sessions/Playing*` for offline progress: `Stopped` alone leaves LastPlayedDate unchanged / null (a watched item drops out of NextUp); `Playing` + `Stopped` stamps the replay time; both skip the newer-server check.
- Never mark watched with UserData `Played:true` (no LastPlayedDate / PlayCount, position kept).
- Offline rewatch of a played item below 90%: no `Played:false` (decided 2026-10-14). Online the same rewatch leaves Played true + the resume point (tested on 12.1), and replaying UserData does the same.
- Online playback keeps `Sessions/Playing` / `Progress` / `Stopped` (`docs/context/player.md`).
