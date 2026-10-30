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
- [x] `useFetch` (cache key `accountId|path`, TTL, abort, `invalidate`)
- [x] Components: PosterCard, LandscapeCard, Row, ProgressBar, DownloadRing
- [x] TS strict, ESLint/Prettier, SPDX headers, CONTRIBUTING (DCO) + TRADEMARKS
- [x] Test setup: `jest-expo` + RNTL, `npm test`, CI on every branch + `main`
- [x] First unit tests for `api.ts`
- [x] Release config hardening, iOS: own `NSLocalNetworkUsageDescription` (dev launcher strips its default in release), ATS `NSAllowsLocalNetworking` only (decided 2026-10-19), `ios.privacyManifests` (UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1 + 85F4.1 - MPVKit is static, no manifest), no Face ID text (`faceIDPermission: false`); `eas.json` production profile (`docs/release/ios.md`)
- [ ] Release config hardening, Android (found in M0, `docs/research/store-requirements.md`): `usesCleartextTraffic: true` via `expo-build-properties` (I12 - release blocks `http://` servers) + `blockedPermissions` (`SYSTEM_ALERT_WINDOW`, `READ`/`WRITE_EXTERNAL_STORAGE`). Re-run release playback on the emulator after (`docs/test-plans/mpv.md`)

## M2 - Auth + accounts

- [x] Auth screens UI on stubs (`src/auth.ts`): TextField, Add server, Sign in, Quick Connect, Accounts, Account (profile card in Settings), signed-out redirect
- [x] Server screen (normalise URL, validate, version warning)
- [x] Password login, Quick Connect (show code, poll; hide when `/QuickConnect/Enabled` is false)
- [x] Session store: accounts in kv-store, tokens in secure-store `tok_<accountId>`
- [x] Account switcher sheet, add/remove/sign out
- [x] Global 401 → signed-out state, keep downloads
- [x] Onboarding rework: Welcome (library wall) → Add server → Sign in as numbered steps with explanations, example addresses and "Where do I find it?"
- [x] Rework Add server from Settings / Accounts: same help as onboarding (examples, where to find it) without the welcome steps; final logo used for the app icon (iOS, Android adaptive + monochrome) and splash - now the pebble screen `LogoMark` (the first two-wave mark is in use by another App Store app)
- [x] Test vs `dev/jellyfin` 12.1 (base) + 10.11 (2026-10-03: scripted auth flows on both; simulator on 10.11; iPhone over LAN on both - password, Quick Connect, switch, sign out); iOS warm deep links emit `url` events (expo/expo#50230) - passed on iPhone

## M3 - Browse

- [x] Home rows + Up Next hero
- [x] Library grid (paging 50, sort, unwatched), Movies/TV segmented
- [x] Movie detail (backdrop scrim, chips, Resume/Play, version/audio/sub rows, cast)
- [x] Series detail (season picker, episodes with progress + download state)
- [x] Search inside the Library (one tab: browse + search, debounced, type capsules, shared filter sheet + tags, paged one-type lists)
- [x] Mark watched / favourite (detail ✓ / ♥, episode menu, Mark Season n as Watched in the season menu, confirm before unwatching a season / show)
- [ ] Skeleton, empty, error states pass - moved to M4S
- [x] Long press on any poster (Home hero + rows, Library, More Like This, series episodes): one shared menu (`ItemMenu`, mounted in the root layout) - Resume + Play from Start (or Play) for movies / episodes, Mark as Watched, Add to Favourites, Download (placeholder until M5); shows and seasons have no Play (their detail picks the episode). VoiceOver: the card's "More" action

## M4 - Playback

- [x] PlaybackInfo (profile per `docs/context/api.md`, check `SupportsDirectPlay`) → media source → static URL; external subs URL built in the client
- [x] Player screen: PlaybackInfo → `PlayerEngine` (mpv adapter), loading / error + Retry, Close
- [x] Player UI (Apple TV style): no permanent chrome - tap shows / hides the controls overlay (auto-hide 3 s, not while paused / scrubbing / VoiceOver); overlay = close (chevron-down), title, ⟲10 / play-pause / 10⟳, scrubber; pull down to close (springs back under the threshold); double-tap left / right = ±10s; no brightness / volume swipes. Tracks / speed button comes with the tracks sheet
- [x] Orientation: `app.json` `orientation` → `default`, `expo-screen-orientation` locks upright portrait at launch, the player unlocks while open
- [x] Tracks sheet (audio, subs incl. external, speed, sub size); starts with the server defaults (`trackOptions`)
- [x] Tracks: check the predicted mpv ids against the engine's track list (a stream mpv drops or a sidecar that fails to load would shift ids) - `onTracks` once the file opened, `matchTracks`; choices kept as Jellyfin indexes. B12-B14 passed on iPhone (2026-10-07), Android pending
- [x] Subtitle timing (offset) in the tracks menu: slider 10 s earlier - 10 s later (0.1 s steps, − / +, Reset), per item and subtitle track (back in sync on another subtitle pick or the next episode), while subtitles are on. JS only - `setSubtitleDelay` was already in both native modules (vendored). Device test B20 pending
- [x] Resume prompt: not needed - every entry point says resume or start over (detail + series buttons, episode card ▶ + ⋯ menu, autoplay from the resume point); decided 2026-10-07
- [x] Reporting start/progress/stop with PlaySessionId (`useReporting`; verified on 12.1 + 10.11 by `check:home`)
- [x] Autoplay next + Up Next tile (last 30 s, smooth countdown ring, tap = play now, ✕ hides), same player screen, next episode from its resume point. iPhone tested (2026-10-07) before the review fixes (bottom stack, pull, resume, drag) - re-check those
- [x] Remember audio / subtitle per user: reports carry `AudioStreamIndex` / `SubtitleStreamIndex` (the server keeps them per item); a pick carries to the next episode by language (`carryTracks`). Device test B16 pending
- [x] Remember subtitle size on the phone (`src/settings.ts`, same for all accounts): the player starts with it, a menu change saves it. Speed is not remembered (resets to 1× on every open, carries only to the next episode). Device test B17 pending
- [x] Subtitle appearance in Settings → Subtitles (decided 2026-10-08: the player menu keeps only Audio, Subtitles, Speed, Subtitle timing): size (moves out of the player menu), font (typeface choice + script coverage incl. CJK, I6), colour presets (no free picker), outline / shadow / background box, live preview. Phone-wide, all accounts (`src/settings.ts`). Text subtitles only (ASS keeps its own style unless overridden, PGS can't be styled). Done: `src/app/subtitles.tsx` - size, font Sans / Serif / Mono, colour White / Yellow / Cyan / Green, edge Outline / Shadow / Box, preview with a sample-language picker; native `edge` in `setSubtitleStyle`. Device tests B17, B22 pending
- [x] Player fixes from the M0 spike (`docs/test-plans/mpv.md`):
  - [x] I2 iOS hwdec lost in background: the player pauses when the app goes to the background (both platforms, JS `AppState`; decided 2026-10-08); iOS lock-screen / headphones Play carries on with audio in the background (`UIBackgroundModes: audio`), the screen follows engine pauses / plays from outside the app (`onPausedChange`); iOS takes the video track off (`vid=no`) in the background and back on (`vid=auto`) on foreground, so the decoder restarts with hwdec. Bounded decoder reset kept as fallback. Device test B21 pending
  - [x] I3 stale first progress: gate progress on the current load generation (`src/player/mpv.tsx`)
  - [x] I4 same URL ignored: `PlayerEngine` does `seek(0)` + `play()` (or a load id)
  - [x] I6 iOS subtitle fonts: bundle Noto incl. CJK (+16 MB, decided 2026-10-08) via `expo-font` `ios.fonts`, OFL-1.1 in `THIRD_PARTY_NOTICES.md`, plus Noto Serif + Sans Mono for the typeface choice. Device test B22 pending
  - [x] I15 no error event for a failed open: `onError` from `END_FILE` (iOS reason error, Android an END_FILE of the current load that isn't EOF / our stop), same stale-load guard as I8; 30 s JS load timeout dropped
  - [x] I8 no EOF event: `onPlaybackEnd` view event on both platforms, unify `keep-open` first, ignore stale EOF from the previous file, don't gate auto-advance on `isPlaying`
- [x] mpv options on both platforms (I11): `network-timeout=15`, `stream-lavf-o=reconnect=1,reconnect_on_network_error=1,reconnect_delay_max=10` (~55 s window, back within ~7 s); buffering spinner (after 0.5 s); an early end (> 5 s before the duration) reloads at the stopped position (`reload: true`, same view), again there = error. Demuxer caps 100 / 32 MiB via `cacheConfig`. B9 passed on iPhone (2026-10-06), Android pending
- [x] I13: mpv verbose log printed the auth header - `http-header-fields` set via the option API (property sets are logged with their value at `v`), iOS log forwarding redacts `Token=`. B15 passed on iPhone + Android (2026-10-07)
- [x] Exact seeks for scrubber / resume: `hr-seek=absolute` on both platforms (absolute seeks + `start` exact, ±10s stays keyframe). B11 passed on iPhone (2026-10-06), Android pending
- [x] Subtitle size on wide video in the landscape player: the same text height on screen whatever the picture's shape. Android sizes subtitles to the view in landscape (upstream); iOS draws them into the picture, so the mpv adapter scales them by view height / picture height (`frameSubtitleScale`, shape from the server's `AspectRatio`). Device test B19 pending
- [x] Video zoom: fit (default, black bars, clear of the notch / Dynamic Island) or fill (cover the screen edge to edge, crops the picture) - top-bar button + pinch, landscape only (portrait always fits), remembered on the phone (`src/settings.ts` `videoZoom`, same for all accounts). Native `setZoomedToFill` on both platforms. Device test B18 pending

## M4S - UI cleanup

Before M5: every screen handles no data and failure the same way.

- [x] Remove the dev primitives preview from Home (`src/dev/PrimitivesPreview.tsx`, `__DEV__` block in `(tabs)/home.tsx`) - and its test
- [x] Empty state on every screen that lists something (Home rows, Library + search, series seasons / episodes, More Like This, cast, Downloads, Accounts): one shared `Message` look, copy that says what to do next
- [x] Error handling on every screen that loads (Home, Library, item + series detail, player, Settings / account, auth screens): error `Message` + Retry, no blank or stuck-spinner screens; 401 / offline per `docs/context/api.md`
- [x] Loading: skeletons / placeholders instead of a bare spinner where layout is known (detail + series load with a spinner today)
- [x] Render tests per screen for the empty and error paths
- [x] Settings pickers rethink: iOS Settings value rows (`OptionRow`) that open a checkmark list (`/option/[key]`, `src/pickers.ts`); Appearance + every subtitle option incl. preview language; subtitle lists keep the preview on top; `ColorSwatches` and the sample chips removed, `Segmented` no longer used in Settings. Download rows move to the same pattern in M5 / M6

## M5 - Downloads

Design + sources: `docs/research/background-downloads.md`.

- [x] `modules/downloads` scaffold (hand-written, no generated view / web / example), typed JS contract in `index.ts` (`docs/context/downloads.md` points to it), typed `EnqueueItem` / `EnqueueOptions` records, `appDelegateSubscribers` in `expo-module.config.json`. Native calls are no-op stubs; device test D1-D3 pending
- [x] iOS: one background `URLSession` (`ios/DownloadsSession.swift`, rules in `docs/context/downloads.md`): created at launch without JS, whole batch at once, max 2 per host, status + size check before the move, resume data, reattach, force-quit restart, retry via `earliestBeginDate`, Keychain credentials, per-request network rule (a toggle moves running tasks). D4 passed on iPhone; D5-D16 pending
- [x] Android shared engine: OkHttp (RN's version, never 5.x), `Range` + `If-Range: <Last-Modified>`, 206 start check, 200 → restart, 416 → start again, `dest` resolved under `filesDir`, paths outside rejected, `.part` + fsync + rename, status mapping 401 / 403 / 404. Queue (`DownloadsQueue`: max 2, retry, network rule + wait) runs in-process until the runners below keep it alive. Device test A1-A10 pending
- [x] Android 14+: UIDT queue-runner `JobService` (`setUserInitiated`, network constraint per setting - one job ID per rule, `setEstimatedNetworkBytes`, `setPersisted`, `setNotification` within 10 s with Pause (tap opens the app; Cancel stays in the app - needs a contract event), `updateTransferredNetworkBytes`, `onStopJob` → system reschedule, Task Manager stop → paused). Schedule failure (background / OEM) → in-process until the next open. Device test U1-U8 pending (Android 14+)
- [x] Android 8-13: WorkManager (`androidx.work` 2.12, decided 2026-10-11) unique work per network rule + `CoroutineWorker` + `setForeground(dataSync)`, same queue + engine (`DownloadsWorker`); also the fallback when a UIDT job is refused (14+). Device test W1-W8 pending
- [x] Module manifest: `ACCESS_NETWORK_STATE`, `RUN_USER_INITIATED_JOBS`, `RECEIVE_BOOT_COMPLETED`, `POST_NOTIFICATIONS` (asked on the first download), JobService (`BIND_JOB_SERVICE`), Pause receiver, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `SystemForegroundService` `dataSync` merge (8-13 path)
- [x] Native credential store + `setCredential` / `clearCredential`, cleared on sign-out (iOS Keychain, Android Keystore-encrypted file, decided 2026-10-10); sign-out / removal stops that account's unfinished downloads (`paused(auth)`): iOS cancels them (resume data holds the header), Android pauses (keeps the `.part`). Device test O1-O4 pending
- [x] Notification permission prompt (Android 13+, `src/notificationPermission.ts`): asked once per install, right after the first download starts (core `PermissionsAndroid`, no dependency); downloads run if denied. P1 passed (Android 15 emulator); P2-P3 pending
- [x] Store + hooks + reconcile + pre-flight (`src/downloads.ts`): versioned `dl` index, `useDownload` / `useDownloadList`, start (batch per account, skip items without `MediaSource.Size`), pause / resume / delete, native events, reconcile on launch + foreground, native credential set on enqueue / reconcile and cleared for signed-out accounts
- [x] Per download: item JSON snapshot, poster / backdrop, external subtitle files (relative paths) - `src/downloadSnapshot.ts`, retried at reconcile, deleted with the item's last version; iOS excludes `Documents/downloads` from backup. Device test S1-S3 + D17 pending
- [x] Network setting: Wi-Fi only / Any network (option list, native `setCellular` at launch + on change) + storage limit slider (Settings → Storage limit, no limit default, checked at start). Device test pending
- [x] Download button (`DownloadButton` + item menu, `src/useDownloadControl.ts`): detail + series header (season) + item menu, ↓ / ring / paused / ✓ states, pause / resume / delete; hidden when `User.Policy.EnableContentDownloading` is false; 403 on start → toast. Device test pending (incl. the store, PR 59)
- [x] Downloads screen (`(tabs)/downloads.tsx`, `show-downloads/[id].tsx`, `DownloadRow`, `StorageBar`): active account only, storage bar (`getFreeDiskStorageAsync`), one list newest first (movies + a row per show that opens its episodes by season), pause / resume ring, play ready (the file on the phone since M6), snapshot posters; delete: swipe left on any row, long-press menu, Delete All in the header (each asks first). Device test pending
- [x] Downloads tab search + type chips: search field on the device (no server call) + All / Movies / Shows chips, fixed under the storage bar; matches a movie's title, a show's name or any of its episode titles (the store's `seriesName`)
- [x] Show why a download waits for the network (iOS): `NWPathMonitor` in `modules/downloads` marks active tasks `reason: network` (`waiting` event) while the path doesn't meet the rule (no network / Wi-Fi only on an expensive path); connection drops while it's blocked don't use up retries. Device test pending (N5-N7)
- [x] Stop a running download in one step: a ring tap opens Pause / Resume + Cancel Download (red, stops + deletes the partial file at once; done episodes of a season stay) - Downloads row, item menu and detail header. Device test C1-C3 pending
- [x] Downloads tab browsing that scales (100+ shows): shows collapsed to one row, movies + shows chips and search, an Episodes chip (every episode on its own row), virtualised lists (tab `FlatList`, a show's screen `SectionList`). Device test L7-L8 pending
- [x] Play Console FGS declaration (dataSync): form text + video script in `docs/release/play-fgs-declaration.md`. Recording + submit with the M7 Play Console item (review server, release build)
- [ ] Tests (`docs/test-plans/downloads.md`): force-quit (iOS: cancelled → re-enqueue), `exit(0)` relaunch, OS kill, reboot, airplane mode, 20GB + 60GB file, server file replaced mid-download (If-Range → 200), token revoked, low disk, Task Manager stop (Android 14+), dataSync timeout (`device_config ... data_sync_fgs_timeout_duration`), Android 16 standby buckets (`am set-standby-bucket`), notification permission denied, `Authorization` header on an iOS background task

## M6 - Offline + offload + sync

- [x] Play downloads from the file: the player looks for a finished download of the item (active account, newest version, file + saved item on disk - `localCopy`) and plays it with its saved subtitles, no PlaybackInfo, no auth (`localPlaySource`); else streams. Online, reports still go to the server; offline they drop until the progress queue. Device test LP1-LP5 pending
- [x] Play the version a Downloads row stands for (two versions of one movie downloaded): `openPlayer` + the player take a media source id (`source` param), used for the local copy and PlaybackInfo; Up Next drops it. Unit-tested; device test LP6 optional (needs a hand-made two-version setup)
- [x] Offline detection + offline UI (Downloads tab primary, detail from snapshots): the api offline flag (`useOffline` / `isOffline`) drives it; item detail falls back to the item saved with a download (`savedItem`: saved art, no More Like This) on any failure, at once when known offline; Downloads row menu → Go to Details; a ready row plays offline from the saved resume point without the 8 s lookup. Auto switch + probe stay with Offline mode below. Device test OF1-OF4 pending
- [x] One "server item, else the saved one" hook (`useItem`) shared by item detail, series and the player (names it from the saved copy, also while loading); offline series = saved name + poster + Downloaded Episodes button. Device test OF5-OF6 pending
- [x] Connection error UI: one consistent state when the server can't be reached (no network / server down / timeout / TLS), told apart from 401 and 5xx, with Retry; no banner (decided 2026-10-14): a page that loaded keeps its content, one offline state (`Offline`: Retry + Go to Downloads) where nothing loaded
- [x] Offline mode state (`src/connection.ts`): the offline flag (any request that can't reach the server sets it, any answer clears it) checked with `/System/Info/Public` at launch, back from the background and on a server switch, rechecked while offline (5 / 10 / 20 s, then every 30 s, on screen only); back online → screens and paged lists that failed for lack of a connection load again. The offline UI above now knows at launch / on return, not only after a failed request. Device test OM1-OM6 pending
- [x] Offline mode UI: screens without cached data point to Downloads (with the connection error UI). Device test OM12-OM16 pending
- [x] Progress queue + replay per `docs/context/sync.md` (GET then POST, last writer wins on `LastPlayedDate`); watched sync for downloaded items
- [x] Auto-remove (`src/offload.ts`, decided 2026-10-14): Remove downloads Never / 30 / 90 / 180 days after download + optional Remove watched (6 h / 24 h / 3 days cooldown, Keep toast), Reset Timer per download / show / all, "Expires in 5 days" / "45h" labels, freed-space toast; cleanup after every sync run, skips unfinished / playing. Device test OL1-OL11 pending
- [x] Weekly orphan sweep (`sweepOrphans` in `src/downloads.ts`): after a reconcile, once a week, deletes account / item folders and files under `downloads/` no download in the index owns; never with an unreadable index or when native didn't answer. Device test OS1-OS4 pending

## M7 - Hardening + release

- [x] Pre-release improvements:
  - [x] Offline series: per-episode art - each episode saves its own still with the snapshot (`still.jpg`) and its Downloads row (a show's screen, Episodes chip) shows it (16:9), not the show's poster. Episodes downloaded before show their backdrop until re-downloaded
  - [x] Pre-release cleanup: Media rows open to list every track (label never wraps), Downloads empty state = the Offline card, no address example chips on Add server, storage bar shows the limit ("12.3 GB of 50 GB · 37.7 GB free", tap → Storage limit), accounts list on top of Settings (tap switches, (i) details, sign out hands over to the next account)
  - [x] Account downloads + stalled transfers: Sign out / Remove account delete the account's downloads (confirm names count + size; a 401 sign-out keeps them); storage bar "15 GB all accounts of 50 GB" with more than one account; Storage limit page says it applies to every account; iOS stall timeout (no bytes 5 min → retries → Failed - network, bytes kept). Device tests D18-D20, O1-O4 pending
  - [x] Storage limit across accounts made explicit: storage bar + Storage limit page wording; the "over the limit" toast names the other accounts' share ("other accounts' downloads take 12.3 GB of it")
- [x] Settings: accounts, playback defaults, downloads, cache, licenses screen
  - [x] Playback defaults (phone-wide): Autoplay next episode (Off: Up Next waits for a tap), Audio language, Show subtitles (Server default / Off / Forced only / On) + Subtitle language on the same page (languages: Server default + English until localisation); Server default keeps Jellyfin's per-user pick (`preferredTracks`). Picks in the player still carry to the next episode. Jest only - device check pending
  - [x] Image cache: no Clear cache button - Android (Glide) keeps the latest 250 MB, iOS capped at 500 MB (`Image.configureCache`); OS may purge both. Subtitle preview text English only until localisation
  - [x] Licences screen: Settings → About → Licences - Rillwood (GPL text + App Store permission), native parts on this platform (mpv module, MPVKit / libmpv, WorkManager, Noto fonts) with the FFmpeg credit line, every production npm package grouped by repository; an entry shows its source, packages and full licence text. Data from `scripts/generate-licences.mjs` on postinstall (`src/licences.json`, gitignored). Rillwood entry links the repo (`app.json` `extra.sourceUrl`)
  - [x] About screen (Settings → About Rillwood): overview, Source code, Licences, Privacy policy, Report a problem, Stand with Ukraine (u24.gov.ua) - links open the browser; repo link works once the repo is public
- [ ] Perf (FlashList if FlatList stutters, image sizes, cold start <2s), accessibility pass
  - [x] Licences off the launch path (JSON read on first use) + virtualised Licences list (SectionList, memoised rows)
  - [x] Accessibility fixes: progress bars inside cards hidden from screen readers (the standalone one says "Watched"), font scaling capped on badges / avatar initials / step numbers + chip and step rows wrap, row titles stay headers beside See All, Watched / Favourite toggles read their state once, labels on Cancel / Reset filters / Go to Downloads, Overview expanded state, episode runtime spoken in minutes, action toasts stay 15 s with a screen reader on
  - [x] Lists: virtualised Cast & Crew (100+ people), separators instead of `gap` on paged lists, memoised episode rows, Up Next idle until its last 30 s. Phone backdrops stay at the cover-crop size (needed for the 4:5 hero)
  - [x] Memoised cards actually skip re-renders: cards and episode rows take the item + one stable `onOpen` / `onMenu` per list (Home, Library, More Like This, paged lists); season episode cards memoised on the episode
- [x] iPad layout for every screen: adaptive grids, readable-width forms and pages, landscape, split view / Stage Manager sizes
  - [x] Wide breakpoint (`useWide`, 600 pt) + readable widths; `Page` centres its content (forms 480, pages 680)
  - [x] Sign-in flow: Add server / Sign in / Quick Connect / Accounts in the form column under a plain centred title; Welcome splits in landscape (wall left, copy right)
  - [x] Tabs as a fixed left sidebar on tablets in landscape (`TabsSidebar`, always shown; portrait: native `sidebarAdaptable`); Library grid columns from the width the tab gets (3 on phones, 6 beside the landscape sidebar, 5 in portrait); Home hero beside its text in landscape
  - [x] Home rows fit whole cards across the row (posters as the Library grid, landscape cards about 220 pt; placeholders fill the row); Downloads in two columns with search + chips on one line; a show's downloads in the readable column
  - [x] Detail + series: landscape hero strip (16:9, at most 60% of the window height, title left), body in one column, Play from Start a round button in the row
  - [x] Player + Settings: player on tablets has wider margins, bigger centre buttons and the tracks menu under its button (no Cancel, a tap outside closes); Settings in landscape is a split view (list left, the page a row opens on the right, the active account's details first; Subtitles → Size goes over it with a back button). Portrait keeps one column. Tested in Jest only
  - [x] `supportsTablet` on + tablets rotate everywhere (`src/orientation.ts`; phones stay upright, player excepted)
- [ ] Splash, screenshots, privacy policy
  - [x] Splash light + dark: white with the black pebble mark / black with the white one (`expo-splash-screen` `dark`), follows the system appearance. Native rebuild - device check pending
  - [ ] Screenshots
    - [x] Showcase library: 10 fictional movies + 5 shows with artwork, `demo` user with watch state (`dev/jellyfin/README.md`)
    - [ ] Capture iPhone + iPad (+ Android) sets, frame for the stores
  - [x] Privacy policy ("connects to your own server") + landing page: `web/` (Astro), deployed to GitHub Pages. Goes live once the repo is public and Pages is on (Settings → Pages → Source: GitHub Actions); put its URL in both store listings
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
- [ ] Play Console: data safety, FGS `dataSync` declaration (record the video, paste the text - `docs/release/play-fgs-declaration.md`), app access, content rating, closed test (12 testers x 14 days for new personal accounts - start early)
- [ ] Release checks: Xcode privacy report on the archive, AAB 16 KB page alignment, release permissions list, no spike / test screens, no `UIFileSharingEnabled` in the release Info.plist (built without `RILLWOOD_FILE_SHARING`)
- [ ] TestFlight + Play internal, 3-5 testers
- [ ] Tag release (`release.yml`: checks + doctor, tag + draft release - `docs/release/ios.md`); publish mpv/FFmpeg source tarballs

## Post-release

- [ ] Localization: extract UI strings, locale-aware dates / sizes / durations, first extra languages, RTL check
- [ ] Animated video zoom: the picture follows the pinch live and springs to fit / fill on release (button animates too), like the pull to close. Fill as an own reanimated scale on the fit view instead of native `setZoomedToFill` (no in-between state); cover factor from the engine's video size (`getTechnicalInfo` `videoWidth` / `videoHeight` after load). Trade-offs: subtitles scale + crop with the picture in fill (~1.3x on 2.39:1), Android `SurfaceView` may ignore the scale (check the pull to close there first; else keep the instant switch), anamorphic files zoom slightly off
- [ ] iOS subtitle size on wide video in native code: move `frameSubtitleScale` from the JS adapter into `MpvPlayerView.swift` (user scale × view height / picture height, from mpv's own `videoAspect` + `layoutSubviews` + zoom, factor 1 in PiP), like Android sizes to the view itself. Drops the `aspect` prop, `pictureAspect`, the wrapper View and the `Platform` check; fixes the PiP limit and the server's shape guess. Vendored change: `UPSTREAM.md` row, B19 on a device

- [ ] Chapters in the player (moved from M4, 2026-10-08): marks on the scrubber (removed from the first Player UI - plain lines didn't explain themselves), names while scrubbing, snap / skip to chapter (`Chapters` on `/Items/{id}`)
- [ ] PiP + keep playing on leave (moved from M4, 2026-10-08; `docs/open-items.md`): PiP when the app goes to the background, and/or keep the audio playing when the app is left (a setting) - the MVP pauses on leave; lock-screen Play already plays audio in the background. Android media session (lock-screen controls)

- [ ] Files app sharing for users: decide keep private vs share (needs the kv-store moved out of `Documents` first) - `docs/open-items.md`
- [ ] Download a show from its page (idea - revise before building): today a show with many seasons means picking each season, then Download. Instead a Download button on the show that asks what to get, like the Apple TV app (e.g. a season picker, all seasons, unwatched only). Decide the choices, where the button sits and how it fits the season header button
- [ ] Long-press menu: Play / Resume Episode for shows and seasons (async next-episode lookup, `seriesNextUp` / `seriesPlayTarget` out of the series screen; `itemActions` into `items.ts`)

## Ideas

- [ ] Research Apple TV (tvOS) + Google TV / Android TV apps: focus navigation (every card is already `Pressable`), RN TV support, player on TV, store requirements
- [ ] Kids mode (post-MVP): a simpler, YouTube-like look for children - big thumbnails in one feed, minimal chrome, only their allowed libraries / parental rating; switch in and out from the profile
- [ ] Download space limit setting: the user picks the most space downloads may use (e.g. 5 / 10 / 25 / 50 GB / no limit), used bytes shown against it; the pre-flight refuses past the limit as well as on free space
- [ ] Pick audio / subtitles on the detail screen (idea, every device): tap a track in the expanded Media list to tick it, Play / Resume starts with it (`openPlayer` passes the Jellyfin indexes, the player already takes them). The pick lasts while the page is open; the player's reports save it on the server once it plays. Today the list only shows the server's defaults, picks happen in the player's tracks menu
