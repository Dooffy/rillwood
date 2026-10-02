# Third-party notices

Third-party code and binaries bundled with Rillwood that aren't npm dependencies. npm licences are checked by `npm run licenses` in `app/`.

## Vendored source

| Component              | Path              | Licence                             | Upstream                                                                                                                         |
| ---------------------- | ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| mpv player Expo module | `app/modules/mpv` | MPL-2.0 (`app/modules/mpv/LICENSE`) | Streamyfin, https://github.com/streamyfin/streamyfin (`modules/mpv-player`). Commit and changes in `app/modules/mpv/UPSTREAM.md` |

## Native binaries

| Component                        | Platform | Licence                                                                 | Notes                                                                                                                                                   |
| -------------------------------- | -------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MPVKit (mpv + FFmpeg)            | iOS      | GPL-3.0 (FFmpeg `--enable-gpl --enable-nonfree`, includes libsmbclient) | Current build. LGPL rebuild post-MVP (CLAUDE.md §11). See `app/modules/mpv/UPSTREAM.md` |
| libmpv (`dev.jdtech.mpv:libmpv`) | Android  | GPL-3.0 (FFmpeg `--enable-gpl --enable-version3`)                       | `1.0.0`, current build. LGPL rebuild post-MVP (CLAUDE.md §11). See `app/modules/mpv/UPSTREAM.md`                                  |
