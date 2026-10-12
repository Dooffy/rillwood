# Background downloads

Research date: 2026-10-02.

Scope: `modules/downloads` (CLAUDE.md §2 / §6 / §8 M5) for Rillwood (Expo SDK 58, RN 0.88, iOS 16.4+, Android minSdk 26 / targetSdk 36). Large originals (20-60 GB) from `GET /Items/{id}/Download`, header auth only.

Legend: **[V]** verified against primary source or tested locally, **[U]** unverified / inference - test on device.

---

## TL;DR

| #   | Finding                                                                                                                                                                                                                                                             | Impact                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | **Android 16 (all apps): jobs running alongside an FGS now count against job runtime quota.** Google's long-running-worker page says WorkManager FGS workers "can exhaust your app's job quota" and points to UIDT. [V]                                             | Planned WorkManager + `setForeground` design degrades into stop/resume cycles on Android 16+                     |
| 2   | **Android 15+ (targetSdk 35+): `dataSync` FGS capped at 6 h per 24 h**, shared across all dataSync services, reset only when the user foregrounds the app. WorkManager >= 2.10 handles `onTimeout` (stop reason `STOP_REASON_FOREGROUND_SERVICE_TIMEOUT`). [V]      | A season of remuxes from a slow remote server can exceed 6 h                                                     |
| 3   | **UIDT jobs (Android 14+)** are the documented fit: user-started, not subject to quotas, no 6 h cap, notification required. **WorkManager still has no UIDT support** (latest stable 2.12.0, 2026-09-23). [V]                                                       | Recommend hybrid: UIDT on API 34+, WorkManager + dataSync FGS on API 26-33                                       |
| 4   | **System `DownloadManager` cannot resume without an ETag** - AOSP `DownloadThread` sets `STATUS_CANNOT_RESUME` when data was written and `mETag == null`. Jellyfin sends Last-Modified only. [V]                                                                    | Rules out DownloadManager                                                                                        |
| 5   | **Jellyfin honours `If-Range` with the Last-Modified date** on 12.1 and 10.11: match -> 206, stale -> 200 full body. `HEAD` -> 405. No ETag. [V, tested on `dev/jellyfin`]                                                                                          | Safe Range resume on Android; iOS resume data works (needs ETag **or** Last-Modified)                            |
| 6   | **iOS resume rate limiter**: starting task N+1 from task N's completion while in background doubles a delay each time. Apple: put all tasks on the session at once. [V]                                                                                             | JS-driven sequential queue will stall in background. Hand the whole season to native up front                    |
| 7   | **`Authorization` is a reserved header** on Apple's URL loading system ("may ignore... overwrite... or not send it"). Jellyfin 12.1 rejects `X-Emby-Authorization` (tested: 401), so there is no alternative header. [V]                                            | Expected to work [U]; must be on the device test plan                                                            |
| 8   | **Expo SDK 58 forwards `handleEventsForBackgroundURLSession` to subscribers and aggregates completion handlers** - each subscriber that implements it must call the handler, including for identifiers that aren't its own. [V, `expo-modules-core` 58.0.11 source] | Our subscriber must call `completionHandler()` straight away for foreign identifiers                             |
| 9   | **iOS backup**: `Documents/` is backed up to iCloud by default. 60 GB of re-downloadable media there breaks Apple's data storage guidelines. [V for default, App Review risk U]                                                                                     | Set `isExcludedFromBackup` on the downloads directory                                                            |
| 10  | **Android 17 (targetSdk 37): `ACCESS_LOCAL_NETWORK` runtime permission** needed for any LAN traffic (OkHttp, sockets, jobs). Below 37 it's implicitly granted. [V]                                                                                                  | Not a problem at targetSdk 36. A background job can't prompt, so ask in the foreground when the target is bumped |

---

## Android

### 1. FGS limits and newer Android versions

| Rule                                | Detail                                                                                                                                                                                                                                                                                                                                                                           | Source                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| dataSync 6 h / 24 h                 | targetSdk 35+. Shared across all dataSync FGS in the app. At the limit the system calls `Service.onTimeout(int,int)`. The service stops being foreground and has "a few seconds" to call `stopSelf()`, otherwise `RemoteServiceException` "did not stop within its timeout"                                                                                                      | [fgs/timeout] [V]                                               |
| Reset                               | Only when the user brings the app to the foreground (full 6 h again)                                                                                                                                                                                                                                                                                                             | [fgs/timeout] [V]                                               |
| Exhausted                           | New `startForeground` of the same type throws `ForegroundServiceStartNotAllowedException` ("Time limit already exhausted for foreground service type dataSync")                                                                                                                                                                                                                  | [fgs/timeout] [V]                                               |
| Test                                | `adb shell device_config put activity_manager data_sync_fgs_timeout_duration <ms>`                                                                                                                                                                                                                                                                                               | [fgs/timeout] [V]                                               |
| WorkManager                         | 2.10.0-alpha03 fixed the ANR for dataSync / shortService timeouts (API 34-35). 2.10.0-alpha04 added `STOP_REASON_FOREGROUND_SERVICE_TIMEOUT`. Workers are stopped and re-run; a later `setForeground` is refused while the budget is spent                                                                                                                                       | [work releases] [V]                                             |
| Applies to SystemForegroundService? | Yes - it's a regular FGS of type dataSync. WorkManager implements `onTimeout` from 2.10                                                                                                                                                                                                                                                                                          | [V via release notes]                                           |
| BOOT_COMPLETED                      | targetSdk 35+ cannot start a dataSync FGS from a `BOOT_COMPLETED` receiver                                                                                                                                                                                                                                                                                                       | [service-types] [V]                                             |
| Background FGS start                | Since Android 12, FGS can't be started from the background (general rule). A WorkManager worker re-run in the background can fail `setForeground` and runs as a plain job (about 10 min) instead                                                                                                                                                                                 | [long-running] [V for rule], WorkManager fallback behaviour [U] |
| **Android 16 job quota (all apps)** | "jobs that are executing concurrently with a foreground service will adhere to the job runtime quota. If you're leveraging jobs for user initiated data transfer, consider using user initiated data transfer jobs instead". Also: jobs started while the app is visible keep counting against quota after it goes invisible. Affects WorkManager, JobScheduler, DownloadManager | [16 behavior-changes-all] [V]                                   |
| Android 16, WorkManager page        | "long-running workers that use foreground services can exhaust your app's job quota" -> launch the FGS directly or use UIDT                                                                                                                                                                                                                                                      | [long-running] [V]                                              |
| Android 16 other                    | `setImportantWhileForeground` is a no-op. New `JobScheduler#getPendingJobReasonsHistory`. `STOP_REASON_TIMEOUT_ABANDONED` (doesn't affect WorkManager)                                                                                                                                                                                                                           | [V]                                                             |
| Android 16, targetSdk 36            | Nothing download-specific. Local network permission is opt-in only                                                                                                                                                                                                                                                                                                               | [V]                                                             |
| Android 17 (all apps)               | Memory limiter (`MemoryLimiter:AnonSwap` in `ApplicationExitInfo`) - stream to disk, never buffer. Nothing new for FGS / jobs                                                                                                                                                                                                                                                    | [17 behavior-changes-all] [V]                                   |
| Android 17, targetSdk 37            | `ACCESS_LOCAL_NETWORK` mandatory for LAN traffic (all networking APIs, background too). TCP to a blocked LAN address shows up as a **timeout**. ECH on by default                                                                                                                                                                                                                | [17 behavior-changes-17], [local-network-permission] [V]        |

### 2. UIDT (user-initiated data transfer) jobs

| Aspect                         | Detail                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API                            | `JobInfo.Builder.setUserInitiated(true)`, API 34+. Permission `RUN_USER_INITIATED_JOBS` (normal, install-time) - `SecurityException` without it [V AOSP JobInfo]                                                                     |
| Scheduling                     | Only while the app is visible, or allowed to start activities from the background. Otherwise `RESULT_FAILURE` [V]                                                                                                                    |
| Constraints                    | On API 34 it **must** have a network constraint (`setRequiredNetwork` / `setRequiredNetworkType`). Allowed: backoff, `setEstimatedNetworkBytes`, `setMinimumNetworkChunkBytes`, `setPersisted`, battery/charging/storage-not-low [V] |
| Quotas                         | "not subject to quotas", `PRIORITY_MAX`, start immediately once constraints are met. Docs: unaffected by standby-bucket quotas [V]                                                                                                   |
| Runtime                        | "extended duration as system conditions allow", based on estimated bytes, thermal state and health. No fixed 6 h cap [V]                                                                                                             |
| Notification                   | `JobService.setNotification(...)` within **10 s** of `onStartJob`, else ANR + stop. Call it on every start. Shown in Task Manager [V AOSP JobService]                                                                                |
| Progress                       | Call `updateTransferredNetworkBytes` / `updateEstimatedNetworkBytes` (API 34) so the system can tell the job is making progress [V]                                                                                                  |
| User stop                      | If the user stops it from Task Manager, the **app can't reschedule** until it's in the foreground again. Add a notification "Pause" action so the user stops it cleanly [V AOSP]                                                     |
| Stops                          | Constraint lost, ran "longer than necessary", thermal, low memory. `onStopJob` -> persist state, return `true` to reschedule [V]                                                                                                     |
| Replace                        | `schedule()` with the ID of a running job stops it [U - standard JobScheduler behaviour]. Add to the queue in-process and call `updateEstimatedNetworkBytes` instead of rescheduling                                                 |
| WorkManager                    | **No support** in 2.12.0 (stable 2026-09-23). Google's own sample: `if (SDK_INT < 34) WorkManager FGS worker else UIDT job` [V]                                                                                                      |
| Notification permission denied | FGS: still runs, notice only in Task Manager, not the drawer [V]. UIDT: same assumed [U]                                                                                                                                             |

**Recommendation: hybrid**

| API                 | Runner                                                                                                                         | Why                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 34+ (Android 14-17) | **One UIDT "queue runner" JobService** (fixed job ID per network policy), processes the native queue with 2 parallel transfers | No 6 h cap, no Android 16 quota, documented use case, survives process death (`setPersisted`)                   |
| 26-33               | **WorkManager unique work** `downloads` (CoroutineWorker + `setForeground(dataSync)`), same queue + transfer engine            | No 6 h cap or Android 16 quota on these versions. WorkManager gives constraints, backoff and reboot persistence |
| Fallback on 34+     | If `schedule()` returns `RESULT_FAILURE` or throws, use the WorkManager path                                                   | Covers OEM quirks and permission stripping                                                                      |

Why not just WorkManager everywhere: issues 1 and 2 hit exactly our case (multi-hour transfers on Android 15/16+). Why not a plain FGS: same 6 h cap, can't restart from the background after a network drop, and no constraint handling.

Why one runner instead of one job per item: concurrency (2) and order stay ours, and season order holds. One notification. Fewer job IDs (JobScheduler caps pending jobs per app).

### 3. Play Console declaration

- Required for targetSdk 34+ for every FGS type in the merged manifest: description, user impact if deferred or interrupted, **video** showing how a user triggers it, use-case pick-list [V].
- dataSync is allowed "specifically for user-initiated work". Google recommends UIDT for network transfers started by the user. No separate Play declaration for UIDT (`RUN_USER_INITIATED_JOBS` is a normal permission) [V].
- We still declare dataSync because the API 26-33 path uses it.

Suggested text:

> **dataSync - Download for offline viewing.** The user taps "Download" on a movie, episode or season. The app downloads the original media file from the user's own Jellyfin server to app storage, so it can be played without a connection. A notification shows progress with Pause and Cancel actions. Used only for downloads the user started; never for background sync. **If deferred:** the download starts later, so it may not be ready before the user goes offline (for example, before a flight). **If interrupted:** the download pauses and resumes from the same byte offset (HTTP Range) when allowed. On Android 14+ the app uses user-initiated data transfer jobs; the foreground service is used on Android 8-13.

Video: add server -> open movie -> Download -> background the app -> notification progress -> pause/resume -> play offline.

### 4. Large-file details

**Range resume (tested on 12.1 + 10.11)**

| Request                                                     | Result                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Range: bytes=0-0`                                          | `206`, `Content-Range: bytes 0-0/<total>`, `Accept-Ranges: bytes`, `Last-Modified`, **no ETag** |
| `Range: bytes=100-199` + `If-Range: <stored Last-Modified>` | `206`, `Content-Range: bytes 100-199/<total>`                                                   |
| same + stale `If-Range` date                                | `200`, full body (`Content-Length: <total>`)                                                    |
| `HEAD`                                                      | `405` - get the size from `Range 0-0` or `MediaSource.Size`                                     |
| No auth                                                     | `401`                                                                                           |

Algorithm (native):

1. First response: store `Last-Modified` and total (from `Content-Range` / `Content-Length`). Check total against `MediaSource.Size` from PlaybackInfo.
2. Resume: `Range: bytes=<partLen>-` + `If-Range: <Last-Modified>`.
3. `206` with `Content-Range` start == `partLen` -> append. `206` with a different start -> fail.
4. `200` -> truncate `.part` and restart (the file changed on the server).
5. `416` -> done if `partLen == total`, else truncate and restart.
6. On EOF: require `partLen == total`, `fsync`, rename `.part` -> final. Prevents "complete" files that are really partial (e.g. screen lock mid-transfer).
7. Statuses: `401` -> `paused(auth)`. **`403` -> error "downloads not allowed for this user"** (Jellyfin user policy `EnableContentDownloading` - also hide the button using `User.Policy`) [U for exact status]. `404` -> failed. `5xx` / IO -> retry with backoff.
8. RFC 9110 §13.1.5: a date `If-Range` only counts as a strong validator if `Date` is at least 1 s after `Last-Modified`. Fine for media files [V spec].

**Storage**

| Option                                         | Notes                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Internal `filesDir` (= Expo `Paths.document`)  | **Recommended for MVP.** Private and removed on uninstall. Already used by kv-store paths                                                                                                                                                                                                          |
| App-specific external (`getExternalFilesDirs`) | Only path to SD cards. Post-MVP                                                                                                                                                                                                                                                                    |
| Backup                                         | The current merged manifest uses expo-secure-store's backup rules. They **include only `sharedpref`**, so files and the SQLite kv-store aren't backed up or device-transferred [V]. If those rules ever change, downloads must be excluded explicitly (device-to-device transfer has no 25 MB cap) |

**Doze / standby / OEM**

- FGS processes have no network restriction (power-details table). Jobs follow standby buckets, and since Android 16 also while an FGS runs [V].
- UIDT is exempt from bucket quotas [V]. Behaviour in Doze and the restricted bucket isn't documented [U].
- OEM killers (Xiaomi, Huawei, Samsung "deep sleeping", OnePlus): out of our control. Mitigate with Range resume plus reconcile on foreground. Optional help link to dontkillmyapp.com. Don't request `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (restricted by Play policy) [U for policy fit].

**Notifications (Android 13+)**: without `POST_NOTIFICATIONS`, FGS still runs and is visible only in Task Manager [V]. Ask before the first download, but don't block or cancel downloads if the user says no.

### 5. System DownloadManager

| Pro                                                         | Con                                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Owned by the system: survives app kill, reboot, OEM killers | **No resume without an ETag** -> any interruption after progress = `STATUS_CANNOT_RESUME` [V AOSP]                                          |
| `addRequestHeader` exists (auth header OK) [V]              | No public pause/resume API                                                                                                                  |
| `setAllowedOverMetered(false)` = Wi-Fi only                 | Progress only by polling a cursor                                                                                                           |
| No FGS declaration                                          | Counts against job quota on Android 16 [V]. Notification UI isn't ours. Under LNP the request may be attributed to the provider process [U] |

Verdict: not viable for Jellyfin originals.

---

## iOS

### 6. Background URLSession realities

| Topic                              | Behaviour                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User force-quit                    | Tasks fail with `NSURLErrorCancelled`, `NSURLErrorBackgroundTaskCancelledReasonKey = NSURLErrorCancelledReasonUserForceQuitApplication`. The session survives (iOS 8+). No background relaunch until the user opens the app [V Quinn 14855, 685525]. Error `userInfo` may carry `NSURLSessionDownloadTaskResumeData` - use it if present [U] |
| OS kill (memory / jetsam)          | Transfers continue in `nsurlsessiond`. App is relaunched in the background for events if `sessionSendsLaunchEvents = true` [V]                                                                                                                                                                                                               |
| Reboot                             | Tasks persisted by the daemon and generally continue after the first unlock [U - test]                                                                                                                                                                                                                                                       |
| Test kill                          | Use `exit(0)` in a debug build, not force-quit [V Quinn]                                                                                                                                                                                                                                                                                     |
| `isDiscretionary`                  | Set `false`. Tasks created **while the app is in the background are discretionary anyway** and wait for good conditions [U wording, widely cited]                                                                                                                                                                                            |
| Resume rate limiter                | Each background resume or relaunch doubles a delay before new tasks start. Reset by foregrounding. **Enqueue everything at once** (hundreds OK, thousands not) [V Quinn 14854]                                                                                                                                                               |
| Resume data                        | Needs: unchanged resource, GET, **ETag or Last-Modified**, server supports byte ranges, temp file not purged under disk pressure [V Apple docs; our server meets this]                                                                                                                                                                       |
| Resume data contents               | Archived plist with the **original request including headers** [U - likely]. Persisting it = persisting the token -> store with `.completeUntilFirstUserAuthentication` protection in Application Support, delete on cancel/finish, or accept and document                                                                                   |
| Timeouts                           | `timeoutIntervalForResource` default 7 days. `timeoutIntervalForRequest` is the idle timeout; for background sessions the daemon retries on network loss instead of failing [U for exact retry]                                                                                                                                              |
| Headers                            | Per-request headers carry over to background tasks. **`Authorization` is reserved** (may be ignored or overwritten) [V Apple]. Works in practice [U, add to test plan]. Redirects across origins may drop it                                                                                                                                 |
| HTTP errors                        | A `401`/`404` still "finishes" as a download with the error body as the file -> check `HTTPURLResponse.statusCode` in `didFinishDownloadingTo`                                                                                                                                                                                               |
| File move                          | Must move synchronously inside `didFinishDownloadingTo`. The temp file sits in the app container, so the move is a rename [U]                                                                                                                                                                                                                |
| Progress while suspended           | No callbacks while suspended. On foreground, `getAllTasks` gives `countOfBytesReceived` / `countOfBytesExpectedToReceive`                                                                                                                                                                                                                    |
| Wi-Fi only                         | `allowsCellularAccess = false` (request or session). Consider also `allowsExpensiveNetworkAccess = false` (blocks personal hotspot, matching Android "unmetered") [U for background sessions]                                                                                                                                                |
| Setting change mid-transfer        | Running tasks keep their original request. Resume data replays the original request, so flipping cellular may need two sessions (cellular / Wi-Fi-only IDs) and moving tasks via resume data [U - open question]                                                                                                                             |
| Concurrency                        | `httpMaximumConnectionsPerHost = 2` on the background config. Ordering not guaranteed by the daemon [U]                                                                                                                                                                                                                                      |
| Local network                      | iOS Local Network Privacy covers URLSession [V TN3179]. LAN servers need `NSLocalNetworkUsageDescription`. Daemon behaviour without the grant isn't documented [U]                                                                                                                                                                           |
| iOS 26 `BGContinuedProcessingTask` | For user-started **CPU/GPU work** with progress UI. Must be submitted from the foreground, identifier in `BGTaskSchedulerPermittedIdentifiers`. Not needed for transfers; it only keeps the process alive for live progress (with a Live Activity). **Post-MVP**                                                                             |
| iOS 26/27 URLSession changes       | None found [U for 27]                                                                                                                                                                                                                                                                                                                        |
| Backup                             | Set `URLResourceValues.isExcludedFromBackup = true` on `Documents/downloads/` (or use `Library/Application Support`)                                                                                                                                                                                                                         |

### 7. Expo Modules API (SDK 58)

**iOS**

- `expo-module.config.json` -> `"apple": { "modules": [...], "appDelegateSubscribers": ["DownloadsAppDelegate"] }` (`ios` key also accepted) [V docs + autolinking].
- `ExpoAppDelegate.application(_:handleEventsForBackgroundURLSession:completionHandler:)` -> `ExpoAppDelegateSubscriberManager`. It filters subscribers that respond, wraps the handler in a counter, and calls the system handler only after **every** subscriber has called its copy [V `expo-modules-core/ios/AppDelegates/ExpoAppDelegateSubscriberManager.swift` L162-189]. The app's `AppDelegate` is an `ExpoAppDelegate` subclass [V].
  - Our subscriber: if `identifier != ourId` -> call `completionHandler()` straight away. Else store it, recreate the session, and call it on the main queue in `urlSessionDidFinishEvents(forBackgroundURLSession:)`.
  - Create the session with the same ID early (subscriber `didFinishLaunchingWithOptions` or module `OnCreate`). The delegate must work with **no JS** (move files, persist state). JS reconciles later.
- Use `task.taskDescription = downloadId` for mapping. It persists with the task, so there's no separate store or `taskIdentifier` bookkeeping.

**Android**

- Module `android/src/main/AndroidManifest.xml` merges into the app [V]. Declare:
  - `RUN_USER_INITIATED_JOBS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` (for `setPersisted`).
  - `<service android:name=".DownloadJobService" android:permission="android.permission.BIND_JOB_SERVICE" android:exported="false"/>`.
  - `<service android:name="androidx.work.impl.foreground.SystemForegroundService" android:foregroundServiceType="dataSync" tools:node="merge"/>` (needs `xmlns:tools`).
- `android/build.gradle`: `implementation "androidx.work:work-runtime-ktx:2.12.0"` (not on the app classpath today [V]). **New dependency, needs §2 approval.** OkHttp: use RN's (`okhttp 4.9.2` in RN 0.88 libs.versions.toml) with `compileOnly` or the same version. Never pull 5.x (breaks RN, which exposes okhttp 4.x via `api()`).
- WorkManager initializes itself through `androidx.startup` - nothing to do in the app.
- Native side runs without JS (process restarted by JobScheduler/WorkManager): the queue + credentials must be readable natively (see "Tokens" below).

### 8. Design rules

| Rule                                                           | Why                                                                                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Native owns the queue; enqueue a whole season up front**     | JS / in-process queue chaining fails in the background (iOS resume rate limiter, no JS running, Android FGS start blocked) |
| Verify final size == expected before finalizing                | A transfer cut at screen lock or process death must not look complete                                                      |
| Versioned `dl` index + migrations; relative paths (already §2) | Downloads must survive app updates and container path changes                                                              |
| Stream to disk; no buffering                                   | Memory kills during large transfers (also Android 17 memory limiter)                                                       |
| Boot must not block on a server probe (M6)                     | Offline launch must reach the Downloads tab                                                                                |
| SD card location post-MVP via `getExternalFilesDirs`           | Only API for removable storage                                                                                             |
| iOS: check non-2xx in `didFinishDownloadingTo`                 | Error bodies otherwise land as the media file                                                                              |
| Tokens are needed after process death - plan for it            | Restored queue items fail auth without them (see below)                                                                    |
| Don't upgrade RN's OkHttp transitively                         | 5.x breaks RN                                                                                                              |
| Use UIDT / WorkManager for boot persistence                    | No uptime / boot-context hacks for the Android 15 `BOOT_COMPLETED` rule                                                    |

---

## Cross-cutting: tokens after process death

The current §6 rule "native side never logs or persists them" can't hold on Android. A UIDT job or WorkManager worker restarted after the process died (or a reboot) runs without JS and needs the header.

| Option                                                                                                                                                         | Pros                                                  | Cons                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A. Native credential store: `setCredential(accountId, header)`, AES key in Android Keystore, ciphertext in `noBackupFilesDir`. Jobs reference `accountId` only | Token never in WorkManager DB, JobInfo extras or logs | Small amount of crypto code                                                                            |
| B. Put the header in WorkManager `Data` / JobInfo extras                                                                                                       | Simplest                                              | Token in plaintext in app-private DBs (same protection as kv-store) - breaks the "never in files" rule |
| C. No token after restart -> `paused(auth)` until the app opens                                                                                                | No persistence                                        | Breaks "survives app kill" on Android                                                                  |

Recommend **A**. On iOS the daemon holds the request (system-protected). Resume data likely contains the header too - handle as above.

---

## Outcome

Applied to CLAUDE.md: §2 Downloads / Download network rows, §6 Downloader contract (`enqueue`, `setCredential` / `clearCredential`, `getTasks`, HTTP rules) and Downloads store, §8 M5 checklist, §11 open items and decisions (`androidx.work`, Android token storage, iOS cellular toggle, iOS 26 live progress).

---

## Risks

| Risk                                                                          | Mitigation                                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Two Android runners (UIDT + WorkManager) = more code                          | Shared transfer engine and queue; runners are thin                                    |
| UIDT stopped by user in Task Manager can't be rescheduled from the background | Mark `paused(user)`, reschedule on foreground reconcile                               |
| OEM UIDT/JobScheduler quirks                                                  | Fallback to WorkManager on `schedule` failure; device matrix (Samsung, Xiaomi, Pixel) |
| iOS daemon ignores `Authorization` in a future iOS                            | Device test each iOS major; no alternative header on 12.x                             |
| Resume data / credential file holds the token                                 | OS file protection, `noBackupFilesDir`, delete on finish / sign-out                   |
| iOS Documents backup                                                          | `isExcludedFromBackup`                                                                |
| Android backup rules depend on expo-secure-store's XML                        | Note in docs; explicit exclude if rules change                                        |
| 6 h dataSync cap on Android 8-13 path                                         | Doesn't apply below Android 15                                                        |

## Open questions

1. Approve `androidx.work` (Android 8-13 only) or use a plain JobScheduler job + own FGS on those versions to avoid the dependency? **Decided 2026-10-11: `androidx.work`.**
2. Credential option A (Keystore) vs B (plaintext in app-private job DB)?
3. iOS cellular toggle semantics for in-flight tasks.
4. Does `httpMaximumConnectionsPerHost` keep FIFO order for background tasks? (device test)
5. Exact Jellyfin status when `EnableContentDownloading = false` (403 expected) - test on `dev/jellyfin`.
6. iOS 26 continued-processing + Live Activity for live progress - post-MVP?
7. UIDT behaviour with notifications denied and in Doze - device test.

## Sources

- FGS timeout: https://developer.android.com/develop/background-work/services/fgs/timeout
- FGS types: https://developer.android.com/develop/background-work/services/fgs/service-types
- dataSync alternatives: https://developer.android.com/about/versions/15/changes/datasync-migration
- UIDT: https://developer.android.com/develop/background-work/background-tasks/uidt
- AOSP `JobInfo.setUserInitiated`, `JobService.setNotification`: https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/apex/jobscheduler/framework/java/android/app/job/
- Long-running workers (Android 16 note): https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running
- WorkManager releases: https://developer.android.com/jetpack/androidx/releases/work
- Android 16 changes: https://developer.android.com/about/versions/16/behavior-changes-all , https://developer.android.com/about/versions/16/behavior-changes-16
- Android 17 changes: https://developer.android.com/about/versions/17/behavior-changes-all , https://developer.android.com/about/versions/17/behavior-changes-17
- Local network permission: https://developer.android.com/privacy-and-security/local-network-permission
- Notification permission: https://developer.android.com/develop/ui/views/notifications/notification-permission
- Power limits: https://developer.android.com/topic/performance/power/power-details
- Play FGS declaration: https://support.google.com/googleplay/android-developer/answer/13392821
- AOSP DownloadProvider `DownloadThread.java` (ETag resume): https://android.googlesource.com/platform/packages/providers/DownloadProvider/+/refs/heads/main/src/com/android/providers/downloads/DownloadThread.java
- Apple background downloads: https://developer.apple.com/documentation/foundation/downloading-files-in-the-background
- Apple resume conditions: https://developer.apple.com/documentation/foundation/urlsessiondownloadtask/cancel(byproducingresumedata:)
- Apple reserved headers: https://developer.apple.com/documentation/foundation/nsurlrequest#Reserved-HTTP-headers
- Quinn - resume rate limiter: https://developer.apple.com/forums/thread/14854 ; testing background sessions: https://developer.apple.com/forums/thread/14855 ; background execution limits: https://developer.apple.com/forums/thread/685525
- TN3179 local network privacy: https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy
- WWDC25 "Finish tasks in the background": https://developer.apple.com/videos/play/wwdc2025/227/
- Expo AppDelegate subscribers: https://docs.expo.dev/modules/appdelegate-subscribers/ ; source `app/node_modules/expo-modules-core/ios/AppDelegates/ExpoAppDelegateSubscriberManager.swift` (58.0.11)
- Local test: `dev/jellyfin` 12.1.0 (:8096) + 10.11.11 (:8097), `GET /Items/{id}/Download` with Range / If-Range / HEAD / alt auth headers (details: [`jellyfin-api.md`](jellyfin-api.md))
