# Third-party notices

Third-party code and binaries bundled with Rillwood that aren't npm dependencies. npm licences are checked by `npm run licenses` in `app/`. The app lists all of these in Settings → Licences - keep the native list in `app/scripts/generate-licences.mjs` in step with this file.

## Vendored source

| Component              | Path              | Licence                             | Upstream                                                                                                                         |
| ---------------------- | ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| mpv player Expo module | `app/modules/mpv` | MPL-2.0 (`app/modules/mpv/LICENSE`) | Streamyfin, https://github.com/streamyfin/streamyfin (`modules/mpv-player`). Commit and changes in `app/modules/mpv/UPSTREAM.md` |

## Fonts

Bundled into the iOS app (`app/assets/fonts`, `app.json` `expo-font` `ios.fonts`) for subtitles - libass can't read iOS system font files. Android uses the system fonts.

| Font                                                                       | Licence | Upstream                                                                                                   |
| -------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Noto Sans, Noto Serif, Noto Sans Mono, Noto Sans Arabic, Noto Sans Hebrew (Regular, hinted TTF) | OFL-1.1 | https://github.com/notofonts/notofonts.github.io `fonts/` @ `47acfd3806a2b2c7f2b8a7cc95030ead55d03c21` |
| Noto Sans CJK SC Regular (OTF; Chinese, Japanese, Korean)                  | OFL-1.1 | https://github.com/notofonts/noto-cjk `Sans/OTF/SimplifiedChinese` @ `f8d157532fbfaeda587e826d4cd5b21a49186f7c` |

## Native binaries

| Component                        | Platform | Licence                                                                 | Notes                                                                                                                                                   |
| -------------------------------- | -------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MPVKit (mpv + FFmpeg)            | iOS      | GPL-3.0 (FFmpeg `--enable-gpl --enable-nonfree`, includes libsmbclient) | Current build. LGPL rebuild post-MVP (CLAUDE.md §11). See `app/modules/mpv/UPSTREAM.md` |
| libmpv (`dev.jdtech.mpv:libmpv`) | Android  | GPL-3.0 (FFmpeg `--enable-gpl --enable-version3`)                       | `1.0.0`, current build. LGPL rebuild post-MVP (CLAUDE.md §11). See `app/modules/mpv/UPSTREAM.md`                                  |
| WorkManager (`androidx.work:work-runtime-ktx`) | Android | Apache-2.0 | `2.12.0`, Android 8-13 download runner (`app/modules/downloads/android/build.gradle`); brings `kotlinx-coroutines` (Apache-2.0) |
