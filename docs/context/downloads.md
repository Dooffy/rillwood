# Downloads (store + native module contract)

Read before working on `src/downloads.ts` (store, hooks, reconcile, cleanup, storage), `modules/downloads/` or the Downloads screen. The native module `modules/downloads/` (M5) is the only thing that talks to the OS; only `src/downloads.ts` imports it. Design + sources: [`docs/research/background-downloads.md`](../research/background-downloads.md).

## Native module

Own Expo module (Swift + Kotlin, Expo Modules API) - no third-party downloader, no system `DownloadManager` (can't resume without ETag). Native owns the queue, order, concurrency (max 2), network rule and retry.

- iOS: one background `URLSession`, whole batch handed over at once (avoids the background resume rate limiter); force-quit cancels transfers → re-enqueue on next launch.
- Android 14+: one user-initiated data transfer (UIDT) job as queue runner. Android 8-13: WorkManager unique worker + `dataSync` FGS (dependency decision pending, `docs/open-items.md`).
- Network setting (Wi-Fi only default / Any network): iOS `allowsCellularAccess` (+ `allowsExpensiveNetworkAccess`), Android UIDT `setRequiredNetworkType` / WorkManager `UNMETERED` vs `CONNECTED`. Wi-Fi only = unmetered. No NetInfo.

Contract (types, calls, events): [`app/modules/downloads/index.ts`](../../app/modules/downloads/index.ts), native module name `Downloads`. `import Downloads from '../../modules/downloads'`, events via `Downloads.addListener('progress' | 'done' | 'error', fn)`.

- `dest` is relative to `Paths.document`; native resolves it under Documents and rejects anything that ends up outside (it re-reads `dest` after process death, without JS). `size` (`MediaSource.Size`) is required - the store's pre-flight skips items without one, so one episode can't block a season.
- `enqueue` items and options are typed `Record`s on both platforms (`EnqueueItem`, `EnqueueOptions`) - the bridge checks field types.
- iOS (`ios/DownloadsSession.swift`, mechanics in the code comments): background session id `app.rillwood.client.downloads`, started at launch by `DownloadsAppDelegateSubscriber` (also on a background relaunch, before JS). The subscriber answers `handleEventsForBackgroundURLSession` for other ids straight away (Expo waits for every subscriber).
  - State: `Application Support/Downloads` (`state.json` versioned + `<id>.resume`), excluded from backup, protected until first unlock. Finished records are removed (JS reconcile finds the file).
  - Credentials: Keychain per account (after first unlock, this device only). No credential → `paused(auth)`.
  - Concurrency: `httpMaximumConnectionsPerHost = 2` - max 2 per server (two servers = up to 4); the daemon doesn't guarantee order within a batch.
  - Retry (5xx, network errors): 3 attempts after 5 s, 30 s, 120 s via `earliestBeginDate` (the daemon holds the delay, also while the app is suspended or dead); the budget resets once bytes flow again; then `error(network)` / `error(system)`. Write errors / disk full → `error(storage)`, 404 / 416 / other status → `error(system)`, no retry (the daemon does the Range resume).
  - Resume data replays the original request incl. the auth header: after a token change (401) the download restarts from 0 with the new credential.
  - `state.json` unreadable (before first unlock) or from a newer version: nothing is overwritten and live tasks are kept.
  - Force-quit: on the next launch the tasks fail with the force-quit reason → restarted at once from their resume data.
  - Network rule (decided 2026-10-09): per request (`allowsCellularAccess`, `allowsExpensiveNetworkAccess`). A change moves running tasks: cancel, restart under the new rule. Resume data replays the old rule, so running files restart from 0 - shipped as is for MVP; two sessions (rule on the session) would keep progress (`docs/open-items.md`).
- Tokens never in URLs or logs. Native keeps them only in OS-protected storage so transfers resume after process death without JS (iOS: the background session; Android: credential store, storage form pending - `docs/open-items.md`). This is the only exception to "tokens only in `expo-secure-store`" (root §2).
- HTTP: never HEAD (405); total from `Content-Range` / `Content-Length`, checked against `MediaSource.Size`. Resume = `Range: bytes=<n>-` + `If-Range: <Last-Modified>`; 206 with another start → fail, 200 → file changed, restart; 416 → done if size == total. Finalize only when size == total (`.part` → rename). iOS: check the HTTP status in `didFinishDownloadingTo` (error bodies "finish" too).
- Status: 401 → `paused(auth)`, 403 → error (user policy `EnableContentDownloading` off - hide Download), 404 → failed, 5xx / IO → native retry with backoff.

## Store (`src/downloads.ts`)

- Index in kv-store key `dl`: `{ version: 1, items }` (`Download` in `src/downloads.ts`); an unknown version or bad JSON starts empty and isn't overwritten, and reconcile then doesn't cancel native tasks - migrations go in `store()` when the version moves on. Watched / progress fields come with offload + sync (M6).
- File `downloads/<accountId>/<itemId>/<sourceId>.<container>` (server ids cleaned to `[A-Za-z0-9_-]` - no `/`, no `..`; delete also removes the empty item folder); URL `/Items/<sourceId>/Download` (an alternate version is an item of its own).
- Hooks: `useDownload(id)` = live progress; `useDownloadList()` = structure only (add, remove, status). Progress stays in memory; kv-store is written only when status / reason change (one write per batch).
- Start: `startDownloads(requests)` for the active account, one native `enqueue` per account (a season = one call); skips items in the index and sources without a size; a batch native rejects ends in `error`. Pre-flight (only when something new starts): free space minus everything still to download stays above max(2 GB, 5% of the disk).
- Native `error` event carries the stopped `state` + `reason` (paused for auth / failed) - JS applies it like `done`, no reconcile.
- `reconcile()` (`initDownloads`: launch + back from the background, not a quick switch; one at a time): mirror native state; no task + full-size file → `done` (any status); no task + queued / downloading → re-send; paused / failed without a task wait for resume; unknown native tasks → `cancel`.
- Credentials follow the session (`subscribeSession`): native holds the header of each signed-in account with downloads, cleared on sign-out / removal (also once its downloads are gone); only changes are sent.
- Network: Wi-Fi only (`cellular: false`) until the network setting lands.
- Also save per download (next PR): item JSON snapshot, poster/backdrop, external subtitle files. Relative paths only.
- iOS downloads dir `isExcludedFromBackup`.
- `cleanup()` on launch + foreground: delete when `now > expires_at`, skip pinned / currently playing / active; weekly orphan sweep.
- Offload policy setting: Off / After watched (default) / After download; delay 0/7/14/30 days (default 7). Watched = local ≥90% or server `UserData.Played`.
- Device test plan (M5): `docs/test-plans/downloads.md` (scaffold rows done) - force-quit, OS kill, reboot, airplane mode, 20GB + 60GB file, file replaced mid-download, token revoked, low disk, Android Task Manager stop + dataSync timeout + standby buckets, notification permission denied, iOS `Authorization` header on a background task.
