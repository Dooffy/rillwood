# Rillwood

Open-source Jellyfin client for iOS and Android. This file is the project overview and the working rules for contributors and AI coding agents. Read it fully before writing code.

Writing style for code, docs and PRs: terse, tables/bullets, hyphens not em dashes, KISS.

> **Never add Claude as co-author** - no `Co-Authored-By` trailer or AI attribution in commits or PRs, ever. See §10 Git.

---

## 1. Product

Rillwood is a new, open-source mobile client for Jellyfin servers. Goals: browse your library fast, play any file as-is (MKV and every common codec, no transcoding), and download for reliable offline viewing.

| In MVP | Out (post-MVP) |
|---|---|
| Add server, login (password + Quick Connect), multiple accounts/servers, switch | tvOS / Android TV (focus engine) |
| Home: Up Next hero, Continue Watching, Next Up, Recently Added | PiP, AirPlay, Chromecast, SyncPlay |
| Library: Movies / TV grid, sort, unwatched filter, search | Trickplay, intro skip |
| Movie + series detail (seasons, episodes) | Download quality presets / transcoded downloads |
| Playback via libmpv: direct play everything, resume, tracks, progress reporting | Live TV, music, books, admin |
| Background downloads (movie / episode / season), pause/resume, survive app kill | Remote-access relay (separate project) |
| Offline mode + progress sync on reconnect | |
| Auto-offload downloads (default: 7 days after watched) | |

Platforms: **iOS first**, Android phones in the same release.

---

## 2. Locked decisions

| Area | Decision | Notes |
|---|---|---|
| Identity | Name **Rillwood**, bundle id / package `app.rillwood.client`, scheme `rillwood` | |
| Framework | Expo SDK 58, RN 0.88, New Arch, CNG, `expo-dev-client` | SDK 58 is in beta (npm `next`, RN 0.88 RC) as of Oct 2026 - move to stable as soon as it ships. No Expo Go (native player). Scene lifecycle is built in on SDK 58 (no `enableSceneSupport` needed). Min iOS 16.4 is the SDK 58 default |
| Navigation | expo-router | File routes, native stack + tabs. Sheets via `presentation: "formSheet"` |
| Platform deps | `expo-router` peers + template basics: `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`, `expo-symbols`, `@expo/ui`, `expo-font`, `expo-linking`, `expo-constants`, `react-dom`, `react-native-web`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui` | Required by the router / SDK - don't remove. Don't build UI on `@expo/ui` or web-only APIs without approval |
| Dev tooling | `typescript`, `@types/react`, `eslint` + `eslint-config-expo` (`npx expo lint`) | |
| UI | **No design system.** `StyleSheet.create` + tokens in `src/theme.ts` | No Gluestack, NativeWind, Tailwind or other UI kit. Hand-build the few primitives. Force dark (`userInterfaceStyle: "dark"`) |
| API | Plain `fetch` wrapper, hand-written types | **No `@jellyfin/sdk`, no axios** |
| State | React only: `useState`/`useReducer`, Context (session), `useSyncExternalStore` (downloads) | **No Zustand, Redux, TanStack Query, MMKV** |
| Persistence | `expo-sqlite/kv-store` (accounts, downloads index, settings, sync queue) | Sync reads on boot |
| Secrets | `expo-secure-store` (token per account) | Never put tokens in URLs or files |
| Files | `expo-file-system` new API (`File`, `Directory`, `Paths`) | Store **relative** paths only (iOS container path changes) |
| Images | `expo-image`, `cachePolicy="disk"` | Offline posters |
| Downloads | **Own Expo module** `modules/downloads` (Swift + Kotlin, Expo Modules API) | No third-party downloader. iOS: background `URLSession`. Android: WorkManager foreground worker + HTTP Range resume. expo-file-system can't reattach after app kill |
| Download network | User setting: **Wi-Fi only (default) / Any network** | Enforced natively by `modules/downloads` (iOS `allowsCellularAccess`, Android `NetworkType.UNMETERED` / `CONNECTED`). No NetInfo |
| Player | libmpv via a vendored MPL-2.0 Expo module in `modules/mpv` (headers kept) behind own `PlayerEngine` interface | Fallback: `expo-libvlc-player`. See §7 - must ship **LGPL** mpv/FFmpeg builds |
| Offload cleanup | Runs on app launch + foreground (`AppState` active) | No expo-background-task in MVP |
| Network status | Fail-fast fetch (8s) + `/System/Info/Public` probe on foreground | |
| Server target | **Jellyfin 12.0 base**, 10.11.x supported | Warn below 10.10.7. Dev server: Docker |
| Tests | `jest-expo` + `@testing-library/react-native` (dev deps in `app/`), `*.test.ts(x)` next to the code | Unit tests for pure logic, regression test per bug fix, render tests for non-trivial components. Mock fetch / storage / native modules. Native code: manual device test plans in `docs/` |
| Builds | `eas build --local` (or prebuild + Xcode/Gradle), manual upload (Transporter / Play Console) | See §9 Xcode 27 note |
| License | **GPL-3.0-or-later + App Store additional permission** (§7) | DCO, no CLA |

---

## 3. Design

Dark, minimal, native-feeling. Content first, chrome out of the way.

All values live in `src/theme.ts`. Never hardcode colours, radii or font sizes in screens.

| Token | Value |
|---|---|
| Background | `#000000` |
| Surface / elevated | `#1C1C1E` / `#2C2C2E` / `#3A3A3C` |
| Separator | `#38383A` |
| Text primary / secondary | `#FFFFFF` / `#98989F` |
| Inactive icon | `#8E8E93` |
| Accent | White (primary buttons white bg, black text). Tweak options: `#0A84FF`, `#30D158`, `#FF9F0A` - flip button text to white when non-white accent |
| Font | System (SF on iOS) - leave `fontFamily` unset |
| Radii | Cards 8-14, buttons 12, pills full |

Rules: large titles 34/700, section headers 20/700 with chevron, 16:9 landscape cards for resume, 2:3 posters, white progress bars, download ring built from plain views (grey track + white arc; stop square = downloading, arrow = paused), min 44pt touch targets, tab bar: Home / Library / Search / Downloads.

---

## 4. Folder structure

Repo layout:

```
/
  app/        mobile app (Expo SDK 58, iOS + Android) - everything in §2-§9 lives here
  web/        static project website (landing, privacy policy, docs) - added later
  docs/       project docs: architecture, decisions, test plans, release process
  .claude/    shared Claude Code skills (/task-init, /submit-code, /create-pull-request, /merge-pr)
  CLAUDE.md   this file
  LICENSE
  README.md
```

`app/` (paths elsewhere in this file are relative to `app/`; run app commands from `app/`):

```
src/app/                 expo-router
  _layout.tsx            providers, reconcile/cleanup/sync on AppState active
  (auth)/server.tsx, login.tsx, quick-connect.tsx, accounts.tsx
  (tabs)/home.tsx, library.tsx, search.tsx, downloads.tsx
  item/[id].tsx          movie / episode detail
  series/[id].tsx
  player.tsx
  settings.tsx
src/theme.ts             design tokens
src/api.ts               fetch client + endpoints + DTO types
src/session.tsx          SessionContext (accounts, active, token)
src/useFetch.ts          in-memory cache, abort, invalidate()
src/downloads.ts         store, queue, reconcile, cleanup, storage
src/sync.ts              offline progress queue replay
src/player/Player.tsx    PlayerEngine interface + re-export of active engine
src/player/mpv.tsx       mpv adapter
src/components/          Button, Text, Toast, Spinner, PosterCard, LandscapeCard, Row, ProgressBar, DownloadRing
modules/mpv/             vendored native module (+ UPSTREAM.md: upstream repo + commit)
modules/downloads/       own native background downloader (iOS + Android)
```

Keep non-route code out of `src/app/`. `app/` and `web/` are independent projects (own `package.json`, no shared workspace) until there is a real need to share code.

---

## 5. Jellyfin API (≈12 endpoints)

**Auth header on every request** (Jellyfin 12 rejects `X-Emby-Token` and `?api_key=`):
```
Authorization: MediaBrowser Client="Rillwood", Device="iPhone", DeviceId="<per-account id>", Version="0.1.0", Token="<token>"
```
- DeviceId: `hash(installId + userId)` per account (shared DeviceId clobbers sessions). Install id via `expo-crypto.randomUUID()` in kv-store.

| Feature | Endpoint |
|---|---|
| Validate / probe | `GET /System/Info/Public` |
| Public users | `GET /Users/Public` |
| Login | `POST /Users/AuthenticateByName` `{Username, Pw}` |
| Quick Connect | `POST /QuickConnect/Initiate` (POST only in 12.0) → poll `GET /QuickConnect/Connect?secret=` → `POST /Users/AuthenticateWithQuickConnect` |
| Logout | `POST /Sessions/Logout` |
| Libraries | `GET /UserViews?userId=` |
| Home rows | `GET /UserItems/Resume`, `GET /Shows/NextUp`, `GET /Items/Latest?parentId=` |
| Grid | `GET /Items?userId&parentId&includeItemTypes=Movie,Series&recursive=true&sortBy=&startIndex=&limit=50&fields=Overview,PrimaryImageAspectRatio` |
| Search | `GET /Items?searchTerm=&includeItemTypes=Movie,Series,Episode&recursive=true` |
| Detail | `GET /Items/{id}?userId=` |
| Seasons / episodes | `GET /Shows/{id}/Seasons`, `GET /Shows/{id}/Episodes?seasonId=` |
| Playback info | `POST /Items/{id}/PlaybackInfo` (DeviceProfile: direct play everything) |
| Stream | `GET /Videos/{id}/stream?static=true&mediaSourceId=` (auth header) |
| External subs | `GET /Videos/{id}/{msId}/Subtitles/{index}/Stream.{srt/ass/vtt}` |
| Reporting | `POST /Sessions/Playing`, `/Sessions/Playing/Progress` (10s + pause/seek), `/Sessions/Playing/Stopped` |
| Download | `GET /Items/{id}/Download` (original file; Range + Last-Modified supported, no ETag) |
| Played | `POST` / `DELETE /UserPlayedItems/{id}` |
| Images | `GET /Items/{id}/Images/{type}?fillWidth=&quality=90&tag=` |

Ticks: 10,000,000 per second.

---

## 6. Key module contracts

**PlayerEngine** (screens never import mpv directly):
```ts
export type Track = { id: number; lang?: string; title?: string; codec?: string };
export type PlayerProps = {
  source: { uri: string; headers?: Record<string, string> };
  startSeconds?: number; audioTrack?: number; subtitleTrack?: number; // -1 = off
  paused?: boolean;
  externalSubs?: { uri: string; lang?: string; title?: string }[];
  onLoad?(e: { duration: number; audio: Track[]; subs: Track[] }): void;
  onProgress?(e: { position: number; duration: number }): void;
  onEnd?(): void; onError?(msg: string): void;
};
export type PlayerRef = { seek(s: number): void; play(): void; pause(): void };
```
Keep playback position in a ref, not state.

**Downloader module** (`modules/downloads`, only `src/downloads.ts` imports it):
```ts
export type Task = { id: string; bytes: number; total: number; state: 'running' | 'paused' | 'done' | 'error' };
export function start(o: { id: string; url: string; headers: Record<string, string>; dest: string /* relative to Paths.document */; cellular: boolean }): void;
export function pause(id: string): void;   // iOS: keeps resume data; Android: keeps .part file
export function resume(id: string): void;
export function cancel(id: string): void;  // deletes partial data
export function getActiveTasks(): Promise<Task[]>;
// events: progress { id, bytes, total } (native-throttled ~500ms), done { id }, error { id, status?, message }
```
Tokens arrive only in `headers`; native side never logs or persists them.

**Downloads store** (`src/downloads.ts`):
- Index in kv-store key `dl`; item: `{ id: "account:item:source", accountId, itemId, title, seriesId?, path (relative), status: queued|downloading|paused|done|error, bytes, total, downloadedAt?, watchedAt?, lastPlayedAt?, pinned, positionTicks?, dirtyProgress? }`.
- Hooks: `useDownload(id)`, `useDownloadList()` via `useSyncExternalStore`; per-item subscriptions; progress throttled to 500ms; persist to kv-store only on structural changes.
- Queue: max 2 active, network per user setting (Wi-Fi only default), retry backoff `min(2^n * 30s, 30min)` up to 5, 401 → `paused(auth)`, 404 → failed.
- Pre-flight: `Paths.availableDiskSpace - size > max(2GB, 5%)`.
- Also save per download: item JSON snapshot, poster/backdrop, external subtitle files.
- `reconcile()` on launch + foreground: `getActiveTasks()` → rebind; missing task + complete file → finalize; missing task + no file → re-queue; orphan native tasks → stop.
- iOS: force-quit cancels transfers (expected) → resume on next launch.
- `cleanup()`: delete when `now > expires_at`, skip pinned / currently playing / active; weekly orphan sweep.
- Offload policy setting: Off / After watched (default) / After download; delay 0/7/14/30 days (default 7). Watched = local ≥90% or server `UserData.Played`.

**Sync** (`src/sync.ts`): offline progress → `dirtyProgress` → on reconnect replay `Sessions/Playing/Stopped` + `UserPlayedItems`; replay local before pulling server UserData.

---

## 7. Licensing rules (must follow)

- `LICENSE` = GPL-3.0 text + App Store additional permission (section 7). Don't edit it.
- Own files header: `// SPDX-License-Identifier: GPL-3.0-or-later`
- Vendored MPL-2.0 files: keep their headers, record commit in `modules/mpv/UPSTREAM.md`. Check none are marked "Incompatible With Secondary Licenses".
- **Player binaries:** Prebuilt MPVKit binaries are typically GPL builds - rebuild **without** `enable-gpl` / `make gpl`, no `--enable-nonfree`, no libx264; dynamic frameworks. Verify Android libmpv `.so` build flags. Publish build scripts + source tarballs per release. The GPL build is OK for local spikes only, never shipped.
- **Never add GPL-only third-party libs to the iOS build** (e.g. `expo-mpv` npm is GPL-3.0-only).
- To add: `CONTRIBUTING.md` (DCO sign-off, contributions under GPL-3.0-or-later + exception), `THIRD_PARTY_NOTICES.md`, `TRADEMARKS.md` (forks welcome, rename + re-icon), in-app licenses screen (`react-native-legal` + manual native entries, FFmpeg LGPL credit line).
- CI: license scan with denylist `GPL-*`/`AGPL-*` for iOS native deps.
- Repo must be **public** before any build reaches external testers (exception requires public Corresponding Source).

---

## 8. Milestones

| # | Milestone | Exit criteria |
|---|---|---|
| M0 | Setup + player spike | Local MKV + auth'd stream play on physical iPhone (then Android) |
| M1 | Foundation | Router shell, theme tokens, api.ts, session, useFetch |
| M2 | Auth + accounts | 2 servers × 2 users, switch without restart, Quick Connect, 401 handled |
| M3 | Browse | Home, library (paging/sort/filter), search, movie + series detail |
| M4 | Playback | Resume, tracks, progress visible in Jellyfin dashboard, autoplay next |
| M5 | Downloads | 20GB file survives kill, season download, reconcile works |
| M6 | Offline + offload + sync | Flight mode browse/play, auto-delete, progress syncs |
| M7 | Hardening + release | TestFlight + Play internal track |

### M0 - Setup + player spike
- [x] Remove `app/.gitkeep`, then `create-expo-app app` (default@sdk-58) at repo root; `npx expo install expo-dev-client expo-file-system expo-sqlite expo-secure-store expo-image expo-crypto expo-build-properties`; `npx expo install --fix`
- [x] `expo-build-properties`: Android minSdk 26 (iOS 16.4 is already the SDK 58 minimum)
- [ ] Vendor the mpv Expo module → `modules/mpv` + `UPSTREAM.md`
- [ ] `npx expo prebuild`, dev build on physical iPhone
- [ ] Docker Jellyfin 12.0 with test media library
- [ ] Test screen: HTTP stream with auth header + local file in Documents
- [ ] Matrix (10 files): H.264, HEVC 10-bit, HDR10, DV P8, AV1 | AAC, AC3, DTS, TrueHD | SRT, ASS, PGS
- [ ] Seek, audio/sub switch, background/foreground, 4K memory
- [ ] Android dev build smoke test
- [ ] iOS local release archive on Xcode 27 with Expo SDK 58
- [ ] Start LGPL MPVKit rebuild investigation (non-blocking for spike)
- [ ] **Gate:** >2 blockers after the full test matrix → swap to `expo-libvlc-player` behind same interface

### M1 - Foundation
- [ ] Router layout per §4; `src/theme.ts` (tokens §3); hand-built Button, Text, Toast, Spinner
- [ ] `api.ts` (header, 8s timeout, `ApiError`, offline flag), DeviceId
- [ ] `useFetch` (cache key `accountId|path`, TTL, abort, `invalidate`)
- [ ] Components: PosterCard, LandscapeCard, Row, ProgressBar, DownloadRing
- [ ] TS strict, ESLint/Prettier, SPDX headers, CONTRIBUTING (DCO)
- [ ] Test setup: `jest-expo` + RNTL, `npm test`, first unit tests for `api.ts`

### M2 - Auth + accounts
- [ ] Server screen (normalise URL, validate, version warning)
- [ ] Password login, Quick Connect (show code, poll)
- [ ] SessionContext: accounts in kv-store, tokens in secure-store `tok_<accountId>`
- [ ] Account switcher sheet, add/remove/sign out
- [ ] Global 401 → signed-out state, keep downloads
- [ ] Test vs Docker Jellyfin 12.0 (base) + 10.11

### M3 - Browse
- [ ] Home rows + Up Next hero
- [ ] Library grid (paging 50, sort, unwatched), Movies/TV segmented
- [ ] Movie detail (backdrop scrim, chips, Resume/Play, version/audio/sub rows, cast)
- [ ] Series detail (season picker, episodes with progress + download state)
- [ ] Search (debounced)
- [ ] Mark watched / favourite; skeleton, empty, error states

### M4 - Playback
- [ ] PlaybackInfo → media source → static URL
- [ ] Player UI: landscape, ±10s, scrubber with chapters, auto-hide, gestures
- [ ] Orientation: `app.json` `orientation` → `default`, lock non-player screens to portrait (needs `expo-screen-orientation` - approve in §2)
- [ ] Tracks sheet (audio, subs incl. external, speed, sub size/offset)
- [ ] Resume prompt (>1 min, <95%)
- [ ] Reporting start/progress/stop with PlaySessionId
- [ ] Autoplay next + up-next overlay (last 30s); remember audio/sub language per user

### M5 - Downloads
- [ ] `modules/downloads` scaffold (`npx create-expo-module --local downloads`), JS contract per §6
- [ ] iOS: background `URLSession` (fixed id), auth header per request, progress events, move file in `didFinishDownloadingTo`, pause = cancel with resume data (persisted), reattach via `getAllTasks`, `handleEventsForBackgroundURLSession` via `AppDelegateSubscriber`, `allowsCellularAccess`
- [ ] Android: WorkManager `CoroutineWorker` + `setForeground` (dataSync notification with progress), HTTP Range resume to `.part` file, network constraint per setting, unique work per download id; module manifest declares FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC, POST_NOTIFICATIONS and the `SystemForegroundService` `dataSync` type
- [ ] Notification permission prompt before first enqueue (Android 13+)
- [ ] Store + hooks + queue + pre-flight + snapshot/images/subs
- [ ] Network setting: Wi-Fi only / Any network
- [ ] Season download (ordered enqueue)
- [ ] Reconcile on launch/foreground
- [ ] Downloads screen: storage bar (`Paths.availableDiskSpace`), in progress, ready, delete
- [ ] Tests: force-quit, OS kill, airplane mode, 20GB file, token revoked, low disk

### M6 - Offline + offload + sync
- [ ] Offline detection + offline UI (Downloads tab primary, detail from snapshots, `file://` playback)
- [ ] Progress queue + replay; watched sync for downloaded items
- [ ] Offload settings + `cleanup()` + Keep pin + "Removes in N days" label + freed-GB toast
- [ ] Weekly orphan sweep

### M7 - Hardening + release
- [ ] Settings: accounts, playback defaults, downloads, cache clear, licenses screen
- [ ] Perf (FlashList if FlatList stutters, image sizes, cold start <2s), accessibility pass
- [ ] Icon, splash, screenshots, privacy policy ("connects to your own server")
- [ ] Make repo public; LGPL player binaries verified
- [ ] Bump versions (`autoIncrement` in eas.json), `eas build -p ios --local` → Transporter; `-p android --local` → Play Console (first `.aab` manual)
- [ ] TestFlight + Play internal, 3-5 testers; App Review notes with demo server + account
- [ ] Tag release; publish mpv/FFmpeg source tarballs

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
- **Xcode 27:** `expo-modules-jsi`'s `build-xcframework.sh` has been known to break **archive** builds on Xcode 27. Verify a local archive on Expo SDK 58 in M0. Fallback: Xcode 26.6 side by side.
- Later CI: public GitHub repo + free standard runners running `eas build --local`.
- OTA: EAS Update free (1K MAU) → self-hosted when needed. Native changes (mpv) always need a rebuild.

---

## 10. Conventions

- KISS. Add a dependency only if §2 says so; otherwise open an issue and get maintainer approval first.
- Expo SDK 58. Expo changes every SDK - check versioned docs (`https://docs.expo.dev/versions/v58.0.0/`) instead of memory. Install with `npx expo install`, never `npm install <pkg>`.
- TypeScript strict; no `any` in api.ts DTOs.
- No tokens in URLs, logs or persisted paths. No `console.*` in committed code.
- Relative file paths only; resolve against `Paths.document` at runtime.
- Every tappable card is `Pressable` (future TV focus).
- Hyphens, not em dashes, in UI copy and docs.
- Run `npm test`, `npx expo lint` and `npx tsc --noEmit` in `app/` before calling a task done. New logic ships with tests; bug fixes ship with a regression test.
- Docs ship with the code: keep `CLAUDE.md` and `docs/` current in the same commit (`/submit-code` checks this).

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

| Item | Status |
|---|---|
| Name checks for Rillwood | App Store/Play search in target markets, trademark search (TMview / USPTO) classes 9 + 41/42, domain (`rillwood.app`), native-speaker sanity check in target markets. Before first store upload |
| Trademark | File after checks pass |
| LGPL MPVKit build (iOS) + libmpv (Android) license verification | Before first public store build |
| Test media | Synthetic matrix via ffmpeg script + real clips (DV P8, PGS, 4K remux) outside repo. To be agreed |
| Package versions | Let `npx expo install --fix` decide; don't hand-pin |
| `app/.npmrc` `legacy-peer-deps=true` | Needed while SDK 58 ships react-native 0.88.0-rc.x (npm rejects RCs in peer ranges). Remove once SDK 58 is stable |
