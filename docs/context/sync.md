# Offline progress sync

Read before working on `src/sync.ts` or anything that writes playback progress offline. Tested against Jellyfin 12.1 + 10.11: [`docs/research/jellyfin-api.md`](../research/jellyfin-api.md).

Offline playback writes `dirtyProgress = { positionTicks, lastPlayedAt (local session start, ISO UTC, clamped ≤ now), watched }` on the download item (`docs/context/downloads.md`). The client applies the server resume rules itself (< 5% → 0, ≥ 90% → watched). On reconnect, per dirty item in `lastPlayedAt` order:

1. `GET /UserItems/{id}/UserData`. Server `LastPlayedDate` newer than local `lastPlayedAt` → server wins: drop local, take server UserData.
2. Watched → `POST /UserPlayedItems/{id}?datePlayed=<lastPlayedAt>` (Played, position 0, PlayCount+1, LastPlayedDate).
3. Else → `POST /UserItems/{id}/UserData {PlaybackPositionTicks, LastPlayedDate: <lastPlayedAt>}` (stored as sent, no server validation - clamp `0 ≤ pos < runtime`).
4. 2xx → clear `dirtyProgress`; 401 → keep, retry after re-login; 404 → drop.

Replay local changes before pulling server UserData.

- Never replay `Sessions/Playing*` for offline progress: `Stopped` alone leaves LastPlayedDate unchanged / null (a watched item drops out of NextUp); `Playing` + `Stopped` stamps the replay time; both skip the newer-server check.
- Never mark watched with UserData `Played:true` (no LastPlayedDate / PlayCount, position kept).
- Online playback keeps `Sessions/Playing` / `Progress` / `Stopped` (`docs/context/player.md`).
- Open: offline rewatch of a played item below 90% - also send `Played:false`? (`docs/open-items.md`)
