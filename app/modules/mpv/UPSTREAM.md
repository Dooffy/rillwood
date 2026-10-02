# Upstream

Vendored mpv player Expo module. Code under `ios/`, `android/`, `src/`, `index.ts` and `expo-module.config.json` is MPL-2.0 (see `LICENSE`). `app.plugin.js` is our own code (GPL-3.0-or-later).

|         |                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Repo    | https://github.com/streamyfin/streamyfin                                                                                       |
| Path    | `modules/mpv-player`                                                                                                           |
| Commit  | `ad708bcd7a4b4f642c28a7717837b8b49db4fe01` (2026-10-01)                                                                        |
| Licence | MPL-2.0 (repo `LICENSE.txt`). Upstream files carry no per-file headers. None are marked "Incompatible With Secondary Licenses" |

## What was kept

The embedded mpv view (`MpvPlayerView`) with its renderer, engine, PiP, Now Playing and logger. These are tightly coupled upstream, so they were kept intact.

- `ios/*.swift`, `ios/MpvPlayer.podspec`
- `android/` root `*.kt`, `nativeplayer/MpvOwnership.kt`, `nativeplayer/engine/PlayerEngine.kt` (interfaces the renderer depends on), unit tests that cover kept code
- `src/` view, module and types (web stubs included)

## What was dropped

| Upstream                                                                                  | Why                                                                         |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `ios/NativePlayer/`, Android `nativeplayer/` UI, controllers, TV screens                  | Presented native player chrome. Rillwood builds its own player UI in RN     |
| Android `ExoPlayerEngine.kt` + Media3, Jellyfin FFmpeg decoder, Compose, TV Material deps | Second engine for the native chrome - not needed, and extra licence surface |
| `src/NativePlayerPresentation*.ts`                                                        | JS API for the dropped native player                                        |
| `src/PiPController.test.ts`                                                               | Asserts on dropped iOS sources                                              |

## Local modifications

| File                        | Change                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `expo-module.config.json`   | Register `MpvPlayerModule` only (no `NativePlayerModule`)                                    |
| `index.ts`                  | Drop `NativePlayerPresentation` exports                                                      |
| `android/build.gradle`      | Drop Compose plugin + Compose, Media3, FFmpeg decoder, TV deps. Keep `dev.jdtech.mpv:libmpv` |
| `src/MpvPlayerView.web.tsx` | Drop `react-i18next`, static iframe title                                                    |
| `src/MpvPlayerView.tsx`     | Drop `console.log` in PiP methods (CLAUDE.md §10)                                            |

Vendored files are excluded from Prettier (`app/.prettierignore`) to stay diffable against upstream.

## Native binaries

| Platform | Binary                                        | Source                         | Status                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS      | MPVKit `0.41.0-av5` (xcframework)             | Podspec URL in `app.plugin.js` | **GPL-3.0 build - current MVP build, LGPL rebuild post-MVP (CLAUDE.md §11).** The renderer needs this fork's `vo_avfoundation` output, so the LGPL rebuild must carry the same patches. The fork also hard-codes FFmpeg `--enable-nonfree` (no nonfree lib linked, but the binary labels itself unredistributable) and merges GPL-3.0 `libsmbclient` - drop both in the rebuild |
| Android  | `dev.jdtech.mpv:libmpv:1.0.0` (Maven Central) | `android/build.gradle`         | **GPL-3.0 build - current MVP build, LGPL rebuild post-MVP (CLAUDE.md §11).** Wrapper is MIT, but upstream `buildscripts/scripts/ffmpeg.sh` uses `--enable-gpl --enable-version3` and mpv builds with default `gpl=true` (checked 2026-10-01, libmpv-android `0d3edfb`). Needs an LGPL rebuild                                                                                  |

## Updating

1. Diff upstream `modules/mpv-player` at the new commit against the commit above.
2. Re-apply the local modifications, keep dropped parts dropped.
3. Update the commit, date and binary versions here.
4. On a libmpv bump: check the NDK it was built with (`strings libmpv.so | grep "clang version"`) and update `LIBMPV_NDK_VERSION` in `app.plugin.js` to match - an older app NDK packs an older `libc++_shared.so` and libmpv fails to load.
