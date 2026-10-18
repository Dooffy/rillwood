# Rillwood

Open-source Jellyfin client for iOS and Android. This file is the project overview and the working rules for contributors and AI coding agents. Read it fully before writing code. Feature rules and contracts live in `docs/context/` - **read the matching doc before working on a feature** (table in §4). Checklists and open items live in `docs/`.

Writing style for code, docs and PRs: terse, tables/bullets, hyphens not em dashes, KISS.

> **Never add Claude as co-author** - no `Co-Authored-By` trailer or AI attribution in commits or PRs, ever. See §10 Git.

---

## 1. Product

Rillwood is a new, open-source mobile client for Jellyfin servers. Goals: browse your library fast, play any file as-is (MKV and every common codec, no transcoding), and download for reliable offline viewing.

| In MVP | Out (post-MVP) |
|---|---|
| Add server, login (password + Quick Connect), multiple accounts/servers, switch | tvOS / Android TV (focus engine) - research in `docs/roadmap.md` Ideas |
| Home: Up Next hero, Continue Watching, Next Up, Recently Added | PiP, AirPlay, Chromecast, SyncPlay |
| Library: browse + search in one tab (All / Movies / Shows / Episodes, sort, filters) | Trickplay, intro skip |
| Movie + series detail (seasons, episodes) | Download quality presets / transcoded downloads |
| Playback via libmpv: direct play everything, resume, tracks, progress reporting | Live TV, music, books, admin |
| | LGPL player builds (iOS dynamic MPVKit, Android optional) - §7, §11 |
| Background downloads (movie / episode / season), pause/resume, survive app kill | Remote-access relay (separate project) |
| Offline mode + progress sync on reconnect | Localization (English only in MVP) |
| Auto-remove downloads (default: 90 days after download; optional sooner once watched) | |

Platforms: **iOS first**, Android phones in the same release. iPad layout before release (M7).

---

## 2. Locked decisions

| Area | Decision | Notes |
|---|---|---|
| Identity | Name **Rillwood**, bundle id / package `app.rillwood.client`, scheme `rillwood` | |
| Framework | Expo SDK 58, RN 0.88, New Arch, CNG, `expo-dev-client` | SDK 58 stable (npm `latest`) + RN 0.88.0 since Oct 2026. No Expo Go (native player). Scene lifecycle is built in on SDK 58 (no `enableSceneSupport` needed). Min iOS 16.4 is the SDK 58 default |
| Navigation | expo-router | File routes, native stack + tabs. Tablet landscape: own fixed `TabsSidebar` on the left, native tab bar `hidden` (one navigator, rotation keeps tab state); iPad portrait: `sidebarAdaptable`. Sheets via `presentation: "formSheet"`. Tab screens: every vertical list spreads `tabList` from `src/theme.ts` (`contentInsetAdjustmentBehavior="automatic"` - iOS native tabs inset only a screen's first scroll view for the tab bar - and no scroll bar); other vertical lists spread `scrollList` |
| Platform deps | `expo-router` peers + template basics: `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`, `expo-symbols`, `@expo/ui`, `expo-font`, `expo-linking`, `expo-constants`, `react-dom`, `react-native-web`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui` | Required by the router / SDK - don't remove. Don't build UI on `@expo/ui` or web-only APIs without approval |
| Dev tooling | `typescript`, `@types/react`, `eslint` + `eslint-config-expo`, `prettier`, `jest` + `@jest/globals` + `jest-expo` + `@react-native/jest-preset` + `@testing-library/react-native`, `expo-doctor`, `license-checker-rseidelsohn` | Tests import `describe` / `it` / `expect` from `@jest/globals` (no global test types in app code). `@react-native/jest-preset` must match the `react-native` version exactly. CI tools are pinned dev deps, never `npx --yes` |
| UI | **No design system.** `StyleSheet.create` + tokens in `src/theme.ts` | No Gluestack, NativeWind, Tailwind or other UI kit. Hand-build the few primitives. Appearance setting **System (default) / Dark / Light** (`userInterfaceStyle: "automatic"`, stored + native override in `src/settings.ts`). Palette resolved once in the root layout and passed down via `ColorsContext` - read it with `useColors()`, never static colours in `StyleSheet.create`. Player forces the dark palette (own provider + light status bar) |
| API | Plain `fetch` wrapper, hand-written types | **No `@jellyfin/sdk`, no axios** |
| State | React only: `useState`/`useReducer`, Context (theme), `useSyncExternalStore` stores (session, settings, downloads) | **No Zustand, Redux, TanStack Query, MMKV** |
| Persistence | `expo-sqlite/kv-store` (accounts, downloads index, settings, sync queue) | Sync reads on boot |
| Secrets | `expo-secure-store` (token per account) | Never put tokens in URLs or files. Only exception: the native downloader keeps a copy in OS-protected storage so downloads resume after process death (`docs/context/downloads.md`) |
| Files | `expo-file-system` new API (`File`, `Directory`, `Paths`) | Store **relative** paths only (iOS container path changes). Opt-in dev builds (`RILLWOOD_FILE_SHARING=1` at prebuild, `app.config.ts`) share `Documents` with the Files app; every other build doesn't. Only legacy call: `getFreeDiskStorageAsync` (`expo-file-system/legacy`) for the download pre-flight - iOS free space incl. purgeable (`Paths.availableDiskSpace` leaves it out) |
| Orientation | `expo-screen-orientation` | Phones: upright portrait everywhere (config plugin `initialOrientation: PORTRAIT_UP` + `lockAppOrientation` in the root layout); the player unlocks (`DEFAULT`) while open and re-locks on leave. Tablets (screen's short side ≥ 600 pt, `src/orientation.ts`) rotate everywhere; `supportsTablet: true`. `app.json` `orientation: default` so the player can rotate. Native-stack / tabs `orientation` options don't hold in dev-client builds - don't use them |
| Glass | `expo-glass-effect` (`Glass` primitive) | Player controls over video: Liquid Glass on iOS 26+, translucent fill (`glassFallback`) elsewhere. Glass never under opacity < 1 - hide by unmounting |
| Background playback | Pause when the app is left (both platforms); iOS lock-screen / headphones Play carries on with audio (`UIBackgroundModes: audio`) | Video track off in the background (I2). Keep playing on leave (a setting) and PiP are post-MVP. Rules: `docs/context/player.md` |
| Images | `expo-image`, `cachePolicy="memory-disk"` | Disk keeps posters offline, memory avoids re-decoding on scroll. Caches clean themselves, no Clear cache button: Android (Glide) keeps the latest 250 MB, iOS capped at 500 MB (`Image.configureCache`, root layout); the OS may purge both when low on space. Downloads keep their own artwork copies |
| Downloads | **Own Expo module** `modules/downloads` (Swift + Kotlin, Expo Modules API). Native owns the queue, concurrency (max 2) and resume | No third-party downloader, no system `DownloadManager`. iOS: background `URLSession`; Android 14+: UIDT job, 8-13 (and a refused UIDT job): WorkManager (`androidx.work:work-runtime-ktx`, only inside `modules/downloads`, decided 2026-10-11) + `dataSync` FGS. Design: `docs/context/downloads.md` |
| Download network | User setting: **Wi-Fi only (default) / Any network** | Enforced natively by `modules/downloads`. No NetInfo |
| Player | libmpv via a vendored MPL-2.0 Expo module in `modules/mpv` (headers kept) behind own `PlayerEngine` interface (`docs/context/player.md`) | Fallback: `expo-libvlc-player` - under review (`docs/open-items.md`). See §7 - current mpv/FFmpeg builds are GPL, LGPL rebuild post-MVP |
| Offload cleanup | Runs after every progress sync run (launch, foreground, reconnect) | No expo-background-task in MVP |
| Network status | Fail-fast fetch (8s) + `/System/Info/Public` probe on foreground, rechecked while offline (`src/connection.ts`) | |
| Server target | **Jellyfin 12.1 base**, 12.0 + 10.11.x supported | Warn below 10.10.7. **Header auth only** (no `?api_key=` / `?ApiKey=`). Dev servers: `dev/jellyfin` (Docker, pinned 12.1 + 10.11). API rules: `docs/context/api.md` |
| Tests | `jest-expo` + `@testing-library/react-native` (dev deps in `app/`), `*.test.ts(x)` next to the code; screen tests in `src/__tests__/` (never put tests in `src/app/` - expo-router treats files there as routes) | Unit tests for pure logic, regression test per bug fix, render tests for non-trivial components. Mock fetch / storage / native modules - shared mocks (kv-store, expo-symbols, safe-area, glass, reanimated + worklets, gesture-handler) in `app/jest.setup.ts`. Native code: manual device test plans in `docs/test-plans/` |
| CI | GitHub Actions, GitHub-hosted `ubuntu-latest`, `.github/workflows/ci.yml`. Runs on every branch push + PRs to `main` | One independent runner per check (matrix, `fail-fast: false`): Lint, Typecheck, Format, Unit tests (+ coverage), Expo doctor, Bundle (iOS + Android), Licences. Plus Commit format + DCO: `[PREFIX]` format, blank line, DCO, no AI attribution |
| Builds | `eas build --local` (or prebuild + Xcode/Gradle), manual upload (Transporter / Play Console) | See §9 Xcode 27 note |
| License | **GPL-3.0-or-later + App Store additional permission** (§7) | DCO, no CLA |

---

## 3. Design

Dark-first, minimal, native-feeling. Content first, chrome out of the way. Light palette follows the iOS system light colours.

All values live in `src/theme.ts`. Never hardcode colours, radii or font sizes in screens. Read colours with `useColors()` (active palette).

| Token | Dark | Light |
|---|---|---|
| Background | `#000000` | `#FFFFFF` |
| Surface / elevated | `#1C1C1E` / `#2C2C2E` / `#3A3A3C` | `#F2F2F7` / `#E5E5EA` / `#D1D1D6` |
| Separator | `#38383A` | `#C6C6C8` |
| Text primary / secondary | `#FFFFFF` / `#98989F` | `#000000` / `#6C6C70` |
| Inactive icon | `#8E8E93` | `#8E8E93` |
| Danger (errors, destructive) | `#FF453A` | `#FF3B30` |
| Success (status dot: active account) | `#30D158` | `#34C759` |
| Warning (soon: a download expiring within a day) | `#FF9F0A` | `#C93400` |
| Backdrop (behind sheets / menus) | `rgba(0,0,0,0.5)` | same (`backdrop`) |
| On artwork (progress / watched status over images, bottom fade) | fill `#FFFFFF`, track `rgba(255,255,255,0.35)`, fade = black 0 → 0.75 gradient (`backgroundImage`) | same (`onArtwork`) |
| Accent | White (primary buttons white bg, black text) | Black (black bg, white text) |
| Font | System (SF on iOS) - leave `fontFamily` unset | same |
| Radii | Cards 8-14, large cards (profile) 20; buttons, icon buttons, segmented controls and pills full (capsule / circle, Apple TV style) | same |

Accent tweak options: `#0A84FF`, `#30D158`, `#FF9F0A` - flip button text to white when non-white accent.

Settings options (iOS Settings style): a row with the current value that opens a checkmark list (`OptionRow` → `/option/[key]`, `src/pickers.ts`); a long numeric range (Storage limit) opens its own page with a `StepSlider` instead; no controls inside cards; `Segmented` only bare on the background for switching what's shown, never for a saved setting.

Rules: large titles 34/700, section headers 20/700 with chevron, 16:9 landscape cards for resume, 2:3 posters, white progress bars (over artwork: bottom fade + time left after the bar, `[=====   ] 9m`; watched items show `✓ Watched` in the same spot), download ring built from plain views (grey track + white arc; stop square = downloading, arrow = paused; tap opens Pause / Resume + Cancel Download), min 44pt touch targets, tab bar: Home / Library / Downloads (search lives in Library). Tab header (`Screen`): large title + 44pt round buttons (the profile avatar too), the same `spacing.sm` gap above every tab's content; scroll bars hidden (`scrollList` / `tabList`). Splash (`app.json`, `expo-splash-screen`): white with the black pebble mark, black with the white one in dark mode (`splash-icon-light/dark.png`); the OS draws it from the system appearance, so the app's Dark / Light setting only applies once it opens.

Tablet (in progress, roadmap M7): `useWide()` (window ≥ 600 pt, follows rotation / Split View) switches a screen to its wide layout; phones never hit it. Content never stretches: `Page` centres a column (`readableWidth.page` 680, forms / `narrow` 480). `Page` screens on wide screens get a plain centred title (`readablePage`, `src/navigation.ts`) instead of a large title. Tab screens size from `useTabContentWidth` (the window less the landscape sidebar), never the window; card rows and grids fit whole cards (`fitCards`, `src/components/Row.tsx`; about `WIDE_POSTER_WIDTH` 140 / `WIDE_LANDSCAPE_WIDTH` 220), phones keep the fixed sizes with the next card peeking in; detail screens get a landscape hero strip (`useHeroLayout`), body in one column; Settings in tablet landscape = split view (`SettingsSplit`: list left, the page a row opens in a pane right - rows open pages through `useSettingsLink`, never `router.push`); player on tablets: wider margins, bigger centre buttons, tracks menu anchored under its button (`ActionSheet` `anchor`); `useWide` / `useWideLandscape` re-render only when the answer flips.

---

## 4. Folder structure

Repo layout:

```
/
  app/        mobile app (Expo SDK 58, iOS + Android) - everything in §2-§9 lives here
  web/        static project website (landing, privacy policy, docs) - added later
  dev/        local dev tooling: dev/jellyfin = pinned Jellyfin servers + test media generator
  docs/       project docs: architecture, decisions, test plans, release process
  .github/    CI workflow + scripts
  .claude/    shared Claude Code skills (/task-init, /submit-code, /create-pull-request, /merge-pr, /update-modules)
  CLAUDE.md   this file
  LICENSE
  README.md
```

`app/` (paths elsewhere in this file are relative to `app/`; run app commands from `app/`):

```
src/app/                 expo-router
  _layout.tsx            providers, reconcile/cleanup/sync on AppState active
  (auth)/welcome.tsx, server.tsx, login.tsx, quick-connect.tsx, accounts.tsx, account.tsx   (no group layout - screens join the root stack)
  (tabs)/home.tsx, library.tsx (browse + search), downloads.tsx
  item/[id].tsx          movie / episode detail
  series/[id].tsx
  player.tsx
  settings.tsx           accounts on top (tap switches), then app settings (Display: appearance + Subtitles, Playback, Downloads, About); tablet landscape: split view (`SettingsSplit`)
  subtitles.tsx          Settings → Subtitles: preview + option rows (size, font, colour, edge, preview text)
  show-downloads/[id].tsx  a show's downloaded episodes by season (from its Downloads row)
  option/[key].tsx       one option's checkmark list (appearance, subtitle options, playback defaults, download network), preview on top for subtitles
  download-storage.tsx   Settings → Storage limit: step slider for the downloads' space limit
  licences.tsx, licence/[id].tsx  Settings → Licences: the list, one entry (source, packages, full texts)
src/theme.ts             design tokens
src/format.ts            display formatting (time left, clock, subtitle timing, file size)
src/api.ts               fetch client + endpoints + DTO types
src/items.ts             pure item logic: Home requests + layout, Latest shaping, time left, card titles, detail facts / tracks / cast, image picks + URLs
src/session.ts           session store: accounts (kv-store), tokens (secure-store), active account, 401 sign-out
src/auth.ts              auth flows for the (auth) screens: probe, sign in, Quick Connect
src/server.ts            server address → probe URLs, min version check (pure)
src/connection.ts        offline mode: `/System/Info/Public` check at launch, foreground, account switch + backoff while offline; back online → failed screens reload
src/navigation.ts        resetTo (clear stack), signed-out redirect, openItem, openPlayer, openDownloads, openLibrary, tabs list, header options (page, plainPage, readablePage)
src/orientation.ts       rotation lock: phones upright (player excepted), tablets free
src/useFetch.ts          in-memory cache, abort, invalidate()
src/useImage.ts          image URL for the active server, sized to the screen scale
src/useItem.ts           one item for a screen: the server's, else the one saved with a download (detail, series, player)
src/usePagedItems.ts     paged lists (Library): load more, refresh, retry, reset per list / account
src/usePullToRefresh.ts  RefreshControl state: spinner until loading ends + 500 ms hold (Home, Library)
src/useDebounced.ts      value once it stops changing (search while typing)
src/testDevice.ts        tests only: phone / tablet window + screen sizes (`setDevice`, `resetDevice`)
src/recentSearches.ts    recent search terms per account, in memory for the session
src/userData.ts          mark watched / favourite: optimistic cache + paged list patch, server answer, refetch
src/useUserFlag.ts       mark from a button / menu: failure toast, confirm before unwatching a season / show
src/useDownloadControl.ts  download from a button / menu: state (item or season), start (files looked up first), pause / resume, cancel, delete after asking, menu actions (`downloadActions`), policy check
src/detail.ts            detailView: everything the detail screen shows, from one item (pure)
src/playback.ts          PlaybackInfo → play source (pure): device profile, direct play check, stream + sidecar subtitle URLs, track options + `matchTracks` (real mpv ids) + `carryTracks` (picks to the next episode by language) + `preferredTracks` (Settings playback defaults)
src/downloads.ts         store, queue, reconcile, cleanup, storage, weekly orphan sweep
src/downloadSnapshot.ts  per-download snapshot: item JSON, poster, backdrop, episode still, external subtitles next to the file
src/downloadList.ts      Downloads tab (pure): one list per account (a row per movie / show, search + type), a show's seasons, status wording
src/notificationPermission.ts  Android 13+: notification permission asked once, when the first download starts
src/sync.ts              offline progress: queue (reports that missed the server), replay for the active account, saved UserData pull
src/offload.ts           auto-remove: timer per download + watched cooldown, expiry labels, cleanup after every sync run, player hold
src/licences.ts          Settings → Licences data (`src/licences.json`, written on install by `scripts/generate-licences.mjs`; read on first use, never at launch)
src/settings.ts          user settings in kv-store (appearance, subtitle size + style, video zoom, playback defaults: autoplay next, audio language, subtitle mode + language, download network + storage limit, auto-remove days + watched cooldown)
src/pickers.ts           Settings options that open a checkmark list: key → title, choices, get / set
src/player/Player.tsx    PlayerEngine interface + re-export of active engine
src/player/mpv.tsx       mpv adapter
src/player/controls.ts   player controls logic (pure): seek clamp, pull-to-close threshold, scrubber maths, zoom (pinch, fit inset)
src/player/progress.ts   position + duration store outside React state (only the controls re-render)
src/player/useReporting.ts  Sessions/Playing, Progress (10 s, pause, seek, track change, background), Stopped + refetch; reports carry the tracks
src/components/          TabsSidebar (+ useTabContentWidth), AccountList (AccountsSection: Settings + saved accounts), Avatar, Button, IconButton, Text, TextField, Toast, Spinner, Screen, Page, List (+ Checkmark, Swatch), StepPills, ServerHelp, LogoMark, Segmented, Card (PosterCard, LandscapeCard, CardPlaceholder), Hero, Chips, PersonCard, Message (+ LoadError, Offline, Empty), DetailHero (+ useHeroLayout), DetailHeader, DetailActions, Overview, CastRow, MoreLikeThis, EpisodeCard, ActionSheet, SeasonMenu, MenuButton, ProgressRing (+ AnimatedProgressRing), SearchField, Chip, FilterSheet (+ FilterButton), FilterChips, PagedList, EpisodeRow, Artwork, Row, ProgressBar, DownloadRing, DownloadButton, DownloadRow (+ ShowDownloadRow, DownloadRowGap), DownloadActions (useDownloadActions), OffloadToast, SwipeToDelete, StorageBar, MediaRow, PlayerControls (+ PlayerBottom, PlayerScrubber), Glass, TracksMenu, TimingSlider, StepSlider, UpNext, SubtitlePreview, OptionList (+ OptionRow), SettingsLink (useSettingsLink), SettingsSplit, SettingsPages (SubtitlesSettings, OptionSettings, StorageSettings, LicenceSettings), LicencesList, AccountDetails, ItemMenu (+ ItemMenuProvider), Skeleton (CardRowPlaceholder, DetailPlaceholder, EpisodeCardsPlaceholder, EpisodeRowsPlaceholder, PosterGridPlaceholder, PosterRowsPlaceholder)
modules/mpv/             vendored native module (+ UPSTREAM.md: upstream repo + commit)
modules/downloads/       own native background downloader (iOS + Android)
```

**Read first** - feature context, loaded on demand (repo-root paths):

| Working on | Read |
|---|---|
| `api.ts`, `items.ts`, `session.ts`, `auth.ts`, `useFetch.ts`, `useImage.ts`, `usePagedItems.ts`, `userData.ts`, auth / accounts, any server call | `docs/context/api.md` - endpoints, auth header, DeviceId, 401/403, tokens |
| `src/player/`, player screen | `docs/context/player.md` - `PlayerEngine` contract, resume, reporting, engine issues |
| `modules/mpv/`, player binaries | `docs/context/mpv.md` - binaries, NDK pin, mpv options, logs |
| `downloads.ts`, `offload.ts`, `modules/downloads/`, Downloads screen | `docs/context/downloads.md` - native contract, HTTP resume rules, store, offload |
| `sync.ts`, offline progress | `docs/context/sync.md` - offline sync flow |
| `dev/jellyfin/`, test media | `docs/context/dev-server.md` |
| Picking / ticking milestone work | `docs/roadmap.md` (§8) |
| Planning, decisions, releases | `docs/open-items.md` (§11) |

Keep non-route code out of `src/app/`. `app/` and `web/` are independent projects (own `package.json`, no shared workspace) until there is a real need to share code.

---

## 5. Jellyfin API

`docs/context/api.md` - endpoints, auth header, DeviceId, error semantics. Per-version test results: `docs/research/jellyfin-api.md`.

---

## 6. Key module contracts

| Contract | Where |
|---|---|
| `PlayerEngine` | `docs/context/player.md` |
| Downloader module + downloads store | `docs/context/downloads.md` |
| Offline sync | `docs/context/sync.md` |

---

## 7. Licensing rules (must follow)

- `LICENSE` = GPL-3.0 text + App Store additional permission (section 7). Don't edit it.
- Own files header: `// SPDX-License-Identifier: GPL-3.0-or-later`
- Vendored MPL-2.0 files: keep their headers, record commit in `modules/mpv/UPSTREAM.md`. Check none are marked "Incompatible With Secondary Licenses".
- **Player binaries:** the MVP uses the current prebuilt GPL builds (MPVKit fork on iOS, `dev.jdtech.mpv:libmpv` on Android; flags in `modules/mpv/UPSTREAM.md`). Post-MVP: rebuild **without** `enable-gpl` / `make gpl`, no `--enable-nonfree`, no libx264 / libsmbclient; dynamic framework on iOS (§11). Record exact binary provenance and publish build scripts / source per release.
- **Never add other GPL-only third-party libs to the iOS build** (e.g. `expo-mpv` npm is GPL-3.0-only) - the MPVKit exception above is the only one.
- `THIRD_PARTY_NOTICES.md` (repo root) lists vendored source + native binaries - update it with every vendored component or binary change. Check for upstream / binary updates with `/update-modules` before every release.
- To add: `CONTRIBUTING.md` (DCO sign-off, contributions under GPL-3.0-or-later + exception), `TRADEMARKS.md` (forks welcome, rename + re-icon).
- In-app licences screen (Settings → Licences): `scripts/generate-licences.mjs` writes `src/licences.json` on postinstall (gitignored) from the production npm packages + a hand-kept native list - keep that list in step with `THIRD_PARTY_NOTICES.md`. The FFmpeg credit line (`LicencesList.tsx`) says GPL-3.0 until the LGPL rebuild. No `react-native-legal`.
- CI: `npm run licenses` fails on any GPL/AGPL-only production dependency (LGPL and `X OR GPL` dual licences allowed). Native binaries (MPVKit, libmpv) aren't npm deps - verify them by hand (§11).
- Repo must be **public** before any build reaches external testers (exception requires public Corresponding Source).

---

## 8. Milestones

| # | Milestone | Exit criteria |
|---|---|---|
| M0 | Setup + player spike | Local MKV + auth'd stream play on physical iPhone (then Android) |
| M1 | Foundation | Router shell, theme tokens, api.ts, session, useFetch |
| M2 | Auth + accounts | 2 servers × 2 users, switch without restart, Quick Connect, 401 handled |
| M3 | Browse | Home, library (browse + search, paging/sort/filter), movie + series detail |
| M4 | Playback | Resume, tracks, progress visible in Jellyfin dashboard, autoplay next |
| M4S | UI cleanup | Dev previews gone, every screen has empty + error states (Retry) |
| M5 | Downloads | 20GB file survives kill, season download, reconcile works |
| M6 | Offline + offload + sync | Flight mode browse/play, auto-delete, progress syncs |
| M7 | Hardening + release | TestFlight + Play internal track |

**Current: M1** leftovers (`useFetch`, cards, release hardening) → **M3**. M2 done; M0 test matrix, Android run and gate still open. Checklists: [`docs/roadmap.md`](docs/roadmap.md).

---

## 9. Build & release

```bash
# dev (from app/)
npx expo prebuild && npx expo run:ios --device
# release (local, no EAS quota)
eas build -p ios --profile production --local --output app.ipa      # → Transporter
eas build -p android --profile production --local --output app.aab  # → Play Console
```
- Accounts: Apple Developer, Play Console.
- Signing: EAS-managed credentials (fetched via `EXPO_TOKEN`) or `credentialsSource: "local"`. Keep Android upload keystore backed up.
- **Xcode 27:** `expo-modules-jsi`'s `build-xcframework.sh` has been known to break **archive** builds on Xcode 27. Verified OK on Xcode 27.0 (27A266a) + SDK 58 (2026-10-01): SDK 58 ships Expo modules precompiled, so the script doesn't run. Re-check on Xcode / SDK bumps. Fallback: Xcode 26.6 side by side.
- Later CI: public GitHub repo + free standard runners running `eas build --local`.
- OTA: EAS Update free (1K MAU) → self-hosted when needed. Native changes (mpv) always need a rebuild.

---

## 10. Conventions

- KISS. Add a dependency only if §2 says so; otherwise open an issue and get maintainer approval first.
- Expo SDK 58. Expo changes every SDK - check versioned docs (`https://docs.expo.dev/versions/v58.0.0/`) instead of memory. Install with `npx expo install`, never `npm install <pkg>`.
- TypeScript strict; no `any` in api.ts DTOs.
- No tokens in URLs, logs or persisted paths. No `console.*` in committed code.
- Relative file paths only; resolve against `Paths.document` at runtime.
- Every tappable card is `Pressable` (future TV focus). Cards in lists take the `item` + one stable `onOpen` / `onMenu` per list (`ItemHandlers`, `src/components/Card.tsx`), not a closure per card - the memoised card then skips re-renders.
- Async submit locks the whole form, not just the button: `<Page form busy={loading}>` (blocks every touch, dismisses the keyboard), fields `editable={!loading}`, the button `loading`, and a ref guard against a double submit in one frame. Results that land after the screen is left must not navigate or set state.
- Hyphens, not em dashes, in UI copy and docs.
- Run `npm run check` in `app/` (lint, typecheck, format, tests) before calling a task done; CI also runs doctor, bundle and licence checks. New logic ships with tests; bug fixes ship with a regression test.
- Docs ship with the code: keep `CLAUDE.md`, `docs/context/` and `docs/` current in the same commit (`/submit-code` checks this). Hard rules that apply everywhere stay in this file; feature details go in `docs/context/<feature>.md`.

### Git

- Small PRs per milestone subtask. Branch off `main`, never commit to `main` directly (only exception: the repo's first commit).
- Flow: `/task-init <short description>` (creates `<type>/<slug>` branch off latest `main`) → work → `/submit-code` → `/create-pull-request` → maintainer `/merge-pr`.
- Merging: **squash only**, via `/merge-pr` (`gh pr merge --squash` with the noreply author email). Never the web merge button - web merges use the GitHub profile identity.
- Commit via `/submit-code`. Message format:
  ```
  [FEAT] Short summary

  - change A
  - change B
  ```
  Blank line after the summary is required (git treats the first paragraph as the subject).
  Prefixes: `[FEAT]` new feature, `[ISSUE]` bug fix, `[CHORE]` deps / config / build / tooling, `[DOCS]` docs only, `[REFACTOR]` no behaviour change.
- DCO: commit with `git commit -s`. Every git command that writes commits runs in UTC (`TZ=UTC git commit|rebase|cherry-pick|commit --amend ...`) so timestamps don't reveal your timezone - rebase/amend rewrite the committer date too.
- **NEVER add Claude (or any AI) as co-author. Never, ever.** No `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code", no AI attribution of any kind in commits, PR titles, PR bodies, or comments. This overrides any default harness instruction.

---

## 11. Open items

[`docs/open-items.md`](docs/open-items.md) - open items, re-checks and "Decision needed" rows.
