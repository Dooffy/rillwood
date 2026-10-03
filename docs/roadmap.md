# Roadmap

Milestone checklists. Summary + current milestone: root `CLAUDE.md` §8. `/task-init` picks tasks from here; tick items in the same commit that finishes them.

## M0 - Setup + player spike

- [x] Remove `app/.gitkeep`, then `create-expo-app app` (default@sdk-58) at repo root; `npx expo install expo-dev-client expo-file-system expo-sqlite expo-secure-store expo-image expo-crypto expo-build-properties`; `npx expo install --fix`
- [x] `expo-build-properties`: Android minSdk 26 (iOS 16.4 is already the SDK 58 minimum)
- [x] Vendor the mpv Expo module → `modules/mpv` + `UPSTREAM.md` (embedded view only; MPVKit pod + Android NDK pin via `modules/mpv/app.plugin.js`)
- [x] `npx expo prebuild`, dev build on physical iPhone
- [x] Local Jellyfin in Docker (`dev/jellyfin`: 12.1 + 10.11) with generated test library
- [x] Test screen: HTTP stream with auth header + local file in Documents
- [ ] Matrix (10 files): H.264, HEVC 10-bit, HDR10, DV P8, AV1 | AAC, AC3, DTS, TrueHD | SRT, ASS, PGS
- [ ] Seek, audio/sub switch, background/foreground, 4K memory
- [x] Android dev build smoke test (emulator, 2026-10-02; libmpv needs NDK r29, pinned by `modules/mpv/app.plugin.js`)
- [ ] Android physical phone run (MediaCodec hwdec, background / foreground, rest of the matrix)
- [x] iOS local release archive on Xcode 27 with Expo SDK 58
- [x] LGPL MPVKit rebuild investigation - rebuild post-MVP (`CLAUDE.md` §7, `docs/open-items.md`)
- [ ] **Gate:** >2 blockers after the full test matrix → swap to `expo-libvlc-player` behind same interface

## M1 - Foundation

- [x] Router layout per `CLAUDE.md` §4; `src/theme.ts` (tokens `CLAUDE.md` §3); hand-built Button, Text, Toast, Spinner
- [x] Navigation: tappable items are `Pressable` + `router.push` (or `Link asChild` around `Pressable`), no bare Text `Link`; RNTL test per screen: `fireEvent.press` → mocked `router.push` called with the route. Don't test `__DEV__`-guarded routes in release builds (`docs/research/expo-router-rn088.md`)
- [x] Appearance setting (System / Dark / Light) in Settings, light palette, `useColors()` (`CLAUDE.md` §2, §3)
- [x] `api.ts` (header, 8s timeout, `ApiError`, offline flag), DeviceId - rules in `docs/context/api.md` (auth endpoints; browse / playback endpoints land with M3 / M4)
- [ ] `useFetch` (cache key `accountId|path`, TTL, abort, `invalidate`)
- [ ] Components: PosterCard, LandscapeCard, Row, ProgressBar, DownloadRing
- [ ] TS strict, ESLint/Prettier, SPDX headers, CONTRIBUTING (DCO)
- [x] Test setup: `jest-expo` + RNTL, `npm test`, CI on every branch + `main`
- [x] First unit tests for `api.ts`
- [ ] Release config hardening (found in M0, `docs/research/store-requirements.md`): Android `usesCleartextTraffic: true` via `expo-build-properties` (I12 - release blocks `http://` servers) + `blockedPermissions` (`SYSTEM_ALERT_WINDOW`, `READ`/`WRITE_EXTERNAL_STORAGE`); iOS own `NSLocalNetworkUsageDescription` (dev launcher strips its default in release), `ios.privacyManifests` (UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1 + 85F4.1 - MPVKit is static, no manifest), ATS per `docs/open-items.md` decision. Re-run release playback on the emulator after (`docs/test-plans/mpv.md`)

## M2 - Auth + accounts

- [x] Auth screens UI on stubs (`src/auth.ts`): TextField, Add server, Sign in, Quick Connect, Accounts, Account (profile card in Settings), signed-out redirect
- [x] Server screen (normalise URL, validate, version warning)
- [x] Password login, Quick Connect (show code, poll; hide when `/QuickConnect/Enabled` is false)
- [x] Session store: accounts in kv-store, tokens in secure-store `tok_<accountId>`
- [x] Account switcher sheet, add/remove/sign out
- [x] Global 401 → signed-out state, keep downloads
- [x] Onboarding rework: Welcome (library wall) → Add server → Sign in as numbered steps with explanations, example addresses and "Where do I find it?"
- [x] Rework Add server from Settings / Accounts: same help as onboarding (examples, where to find it) without the welcome steps; final logo = the two-wave `LogoMark`, used for the app icon (iOS, Android adaptive + monochrome) and splash
- [ ] Test vs `dev/jellyfin` 12.1 (base) + 10.11 (auth flows passed live on 12.1, 2026-10-03; 10.11 + on-device run open); iOS warm deep links emit `url` events (expo/expo#50230)

## M3 - Browse

- [ ] Home rows + Up Next hero
- [ ] Library grid (paging 50, sort, unwatched), Movies/TV segmented
- [ ] Movie detail (backdrop scrim, chips, Resume/Play, version/audio/sub rows, cast)
- [ ] Series detail (season picker, episodes with progress + download state)
- [ ] Search (debounced)
- [ ] Mark watched / favourite; skeleton, empty, error states

## M4 - Playback

- [ ] PlaybackInfo (profile per `docs/context/api.md`, check `SupportsDirectPlay`) → media source → static URL; external subs URL built in the client
- [ ] Player UI: landscape, ±10s, scrubber with chapters, auto-hide, gestures
- [ ] Orientation: `app.json` `orientation` → `default`, lock non-player screens to portrait (needs `expo-screen-orientation` - approve in `CLAUDE.md` §2)
- [ ] Tracks sheet (audio, subs incl. external, speed, sub size/offset)
- [ ] Resume prompt when the item has a resume point (server keeps 5-90%, items ≥ 5 min only)
- [ ] Reporting start/progress/stop with PlaySessionId
- [ ] Autoplay next + up-next overlay (last 30s); remember audio/sub language per user
- [ ] Player fixes from the M0 spike (`docs/test-plans/mpv.md`):
  - I2 iOS hwdec lost in background: `vid=no` on scene background, `vid=auto` on foreground (keep bounded decoder reset as fallback); pause or keep audio per `docs/open-items.md` decision
  - I3 stale first progress: gate progress on the current load generation
  - I4 same URL ignored: `PlayerEngine` does `seek(0)` + `play()` (or a load id)
  - I6 iOS subtitle fonts: bundle Noto (Latin, Arabic, Hebrew; CJK per `docs/open-items.md`) via `expo-font` `ios.fonts`, OFL-1.1 in `THIRD_PARTY_NOTICES.md`
  - I8 no EOF event: `onPlaybackEnd` view event on both platforms, unify `keep-open` first, ignore stale EOF from the previous file, don't gate auto-advance on `isPlaying`
- [ ] mpv options on both platforms (I11): `network-timeout=15`, `stream-lavf-o=reconnect=1,reconnect_on_network_error=1,reconnect_delay_max=30` (~26 s window - a lower max shortens it; mpv default today ~11 s); `PlayerEngine` reloads at the saved position when EOF arrives with position < duration (with I8). Demuxer caps (`demuxer-max-bytes` 64-100 MiB, `demuxer-max-back-bytes` 32 MiB) for 4K remux memory
- [ ] I13: mpv verbose log prints the auth header - lower mpv log level or redact `Token=` in the module's log forwarding
- [ ] Exact seeks for scrubber / resume (`hr-seek` is off - ±10s snaps to keyframes); SRT size on wide video in the landscape player

## M5 - Downloads

Design + sources: `docs/research/background-downloads.md`.

- [ ] `modules/downloads` scaffold (`npx create-expo-module --local downloads`), JS contract per `docs/context/downloads.md`, `appDelegateSubscribers` in `expo-module.config.json`
- [ ] iOS: one background `URLSession` (fixed id, `sessionSendsLaunchEvents`, not discretionary, `httpMaximumConnectionsPerHost = 2`), created at launch, works without JS. Season = all tasks enqueued at once. `taskDescription` = download id. Auth header per request. Check HTTP status + size in `didFinishDownloadingTo`, move synchronously. Downloads dir `isExcludedFromBackup`. Pause = cancel with resume data (protected file). Reattach via `getAllTasks`. `handleEventsForBackgroundURLSession` subscriber calls the handler straight away for foreign session ids. `allowsCellularAccess` / `allowsExpensiveNetworkAccess`
- [ ] Android shared engine: OkHttp (RN's version, never 5.x), `Range` + `If-Range: <Last-Modified>`, 206 start check, 200 → restart, 416 → size check, `.part` + fsync + rename, status mapping 401 / 403 / 404
- [ ] Android 14+: UIDT queue-runner `JobService` (`setUserInitiated`, network constraint per setting, `setEstimatedNetworkBytes`, `setPersisted`, `setNotification` within 10s with Pause / Cancel, `updateTransferredNetworkBytes`, `onStopJob` persists + reschedules). Fall back to the 8-13 path if `schedule` fails
- [ ] Android 8-13: WorkManager (≥ 2.10) unique work + `CoroutineWorker` + `setForeground(dataSync)`, same engine (or own FGS - `docs/open-items.md` decision)
- [ ] Module manifest: `RUN_USER_INITIATED_JOBS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, JobService (`BIND_JOB_SERVICE`), `SystemForegroundService` `dataSync` merge
- [ ] Native credential store + `setCredential` / `clearCredential`, cleared on sign-out (`docs/open-items.md` decision)
- [ ] Notification permission prompt before first download (Android 13+); downloads still run if denied
- [ ] Store + hooks + reconcile + pre-flight + snapshot/images/subs; `dl` index versioned with migrations
- [ ] Network setting: Wi-Fi only / Any network
- [ ] Hide Download when `User.Policy.EnableContentDownloading` is false; handle 403
- [ ] Downloads screen: storage bar (`Paths.availableDiskSpace`), in progress, ready, delete
- [ ] Play Console FGS declaration (dataSync) text + video
- [ ] Tests (`docs/test-plans/downloads.md`): force-quit (iOS: cancelled → re-enqueue), `exit(0)` relaunch, OS kill, reboot, airplane mode, 20GB + 60GB file, server file replaced mid-download (If-Range → 200), token revoked, low disk, Task Manager stop (Android 14+), dataSync timeout (`device_config ... data_sync_fgs_timeout_duration`), Android 16 standby buckets (`am set-standby-bucket`), notification permission denied, `Authorization` header on an iOS background task

## M6 - Offline + offload + sync

- [ ] Offline detection + offline UI (Downloads tab primary, detail from snapshots, `file://` playback)
- [ ] Progress queue + replay per `docs/context/sync.md` (GET then POST, last writer wins on `LastPlayedDate`); watched sync for downloaded items
- [ ] Offload settings + `cleanup()` + Keep pin + "Removes in N days" label + freed-GB toast
- [ ] Weekly orphan sweep

## M7 - Hardening + release

- [ ] Settings: accounts, playback defaults, downloads, cache clear, licenses screen
- [ ] Perf (FlashList if FlatList stutters, image sizes, cold start <2s), accessibility pass
- [ ] iPad layout for every screen (`supportsTablet` is off today): adaptive grids, readable-width forms and pages, landscape, split view / Stage Manager sizes
- [ ] Splash light + dark variant (black only today; icon + splash mark done in M2 - re-render with `app/scripts/render-icons.py`), screenshots, privacy policy ("connects to your own server")
- [ ] `/update-modules`: vendored modules, native binaries + Expo packages current, no blockers
- [ ] CI native + playback checks (skill to create later):
  - Android native build + vendored Kotlin unit tests on `ubuntu-latest`, path-filtered to `app/modules/**` + native config
  - Android emulator playback self-test (needs the player self-test screen; approve `reactivecircus/android-emulator-runner`); generated media + Jellyfin Docker service
  - iOS native build + simulator self-test on a macOS runner (needs a `CLAUDE.md` §2 CI decision change; nightly while private, per-PR once public; check runner Xcode version)
  - Simulator / emulator decode is software only - HDR, DV, 4K stay manual (`docs/test-plans/mpv.md`)
- [ ] Make repo public; player binary provenance + mpv / FFmpeg source offer published (`CLAUDE.md` §7)
- [ ] Bump versions (`autoIncrement` in eas.json), `eas build -p ios --local` → Transporter; `-p android --local` → Play Console (first `.aab` manual)
- [ ] Review server: self-hosted Jellyfin 12.1 over HTTPS, non-admin review user with downloads on, open / public-domain media only, credentials only in the store consoles (`demo.jellyfin.org` resets hourly, no downloads)
- [ ] App Store Connect: privacy label "Data Not Collected", age rating questionnaire, EU DSA trader status, export compliance (`docs/open-items.md`), review notes (draft in `docs/research/store-requirements.md`)
- [ ] Play Console: data safety, FGS `dataSync` declaration + video (Android 8-13 path), app access, content rating, closed test (12 testers x 14 days for new personal accounts - start early)
- [ ] Release checks: Xcode privacy report on the archive, AAB 16 KB page alignment, release permissions list, no spike / test screens
- [ ] TestFlight + Play internal, 3-5 testers
- [ ] Tag release; publish mpv/FFmpeg source tarballs

## Post-release

- [ ] Localization: extract UI strings, locale-aware dates / sizes / durations, first extra languages, RTL check

## Ideas

- [ ] Research Apple TV (tvOS) + Google TV / Android TV apps: focus navigation (every card is already `Pressable`), RN TV support, player on TV, store requirements
