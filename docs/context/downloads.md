# Downloads (store + native module contract)

Read before working on `src/downloads.ts` (store, hooks, reconcile, cleanup, storage), `modules/downloads/` or the Downloads screen. The native module `modules/downloads/` (M5) is the only thing that talks to the OS; only `src/downloads.ts` imports it. Design + sources: [`docs/research/background-downloads.md`](../research/background-downloads.md).

## Native module

Own Expo module (Swift + Kotlin, Expo Modules API) - no third-party downloader, no system `DownloadManager` (can't resume without ETag). Native owns the queue, order, concurrency (max 2), network rule and retry.

- iOS: one background `URLSession`, whole batch handed over at once (avoids the background resume rate limiter); force-quit cancels transfers → re-enqueue on next launch.
- Android 14+: one user-initiated data transfer (UIDT) job as queue runner. Android 8-13: WorkManager unique worker + `dataSync` FGS (dependency decision pending, `docs/open-items.md`).
- Network setting (Wi-Fi only default / Any network): iOS `allowsCellularAccess` (+ `allowsExpensiveNetworkAccess`), Android UIDT `setRequiredNetworkType` / WorkManager `UNMETERED` vs `CONNECTED`. Wi-Fi only = unmetered. No NetInfo.

```ts
export type TaskState =
  "queued" | "running" | "waiting" | "paused" | "done" | "error";
export type Task = {
  id: string;
  bytes: number;
  total: number;
  state: TaskState;
  reason?: "network" | "auth" | "user" | "storage" | "system";
};
export function setCredential(
  accountId: string,
  headers: Record<string, string>,
): void; // native secure store
export function clearCredential(accountId: string): void; // on sign-out
export function enqueue(
  items: {
    id: string;
    accountId: string;
    url: string;
    dest: string /* relative to Paths.document */;
    size: number;
  }[],
  o: { cellular: boolean },
): void; // whole batch, keeps order
export function pause(id: string): void; // iOS: keeps resume data; Android: keeps .part + Last-Modified
export function resume(id: string): void;
export function cancel(id: string): void; // deletes partial data
export function setCellular(cellular: boolean): void;
export function getTasks(): Promise<Task[]>;
// events: progress { id, bytes, total } (native-throttled ~500ms), done { id }, error { id, status?, message }
```

- Tokens never in URLs or logs. Native keeps them only in OS-protected storage so transfers resume after process death without JS (iOS: the background session; Android: credential store, storage form pending - `docs/open-items.md`). This is the only exception to "tokens only in `expo-secure-store`" (root §2).
- HTTP: never HEAD (405); total from `Content-Range` / `Content-Length`, checked against `MediaSource.Size`. Resume = `Range: bytes=<n>-` + `If-Range: <Last-Modified>`; 206 with another start → fail, 200 → file changed, restart; 416 → done if size == total. Finalize only when size == total (`.part` → rename). iOS: check the HTTP status in `didFinishDownloadingTo` (error bodies "finish" too).
- Status: 401 → `paused(auth)`, 403 → error (user policy `EnableContentDownloading` off - hide Download), 404 → failed, 5xx / IO → native retry with backoff.

## Store (`src/downloads.ts`)

- Index in kv-store key `dl` (versioned, with migrations); item: `{ id: "account:item:source", accountId, itemId, title, seriesId?, path (relative), status: queued|downloading|paused|done|error, bytes, total, downloadedAt?, watchedAt?, lastPlayedAt?, pinned, positionTicks?, dirtyProgress?: { positionTicks, lastPlayedAt, watched } }`.
- Hooks: `useDownload(id)`, `useDownloadList()` via `useSyncExternalStore`; per-item subscriptions; progress throttled to 500ms; persist to kv-store only on structural changes.
- Queue rules are enforced natively; JS mirrors state and re-enqueues on reconcile. Season = one `enqueue` call.
- Pre-flight: `Paths.availableDiskSpace - size > max(2GB, 5%)`.
- Also save per download: item JSON snapshot, poster/backdrop, external subtitle files. Relative paths only.
- `reconcile()` on launch + foreground: `getTasks()` → rebind; missing task + complete file → finalize; missing task + no file → re-queue; orphan native tasks → stop.
- iOS downloads dir `isExcludedFromBackup`.
- `cleanup()` on launch + foreground: delete when `now > expires_at`, skip pinned / currently playing / active; weekly orphan sweep.
- Offload policy setting: Off / After watched (default) / After download; delay 0/7/14/30 days (default 7). Watched = local ≥90% or server `UserData.Played`.
- Device test plan (M5): `docs/test-plans/downloads.md` (to write) - force-quit, OS kill, reboot, airplane mode, 20GB + 60GB file, file replaced mid-download, token revoked, low disk, Android Task Manager stop + dataSync timeout + standby buckets, notification permission denied, iOS `Authorization` header on a background task.
