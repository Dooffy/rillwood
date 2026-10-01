# Third-party notices

Third-party code and binaries bundled with Rillwood that aren't npm dependencies. npm licences are checked by `npm run licenses` in `app/`.

## Vendored source

| Component              | Path              | Licence                             | Upstream                                                                                                                         |
| ---------------------- | ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| mpv player Expo module | `app/modules/mpv` | MPL-2.0 (`app/modules/mpv/LICENSE`) | Streamyfin, https://github.com/streamyfin/streamyfin (`modules/mpv-player`). Commit and changes in `app/modules/mpv/UPSTREAM.md` |

## Native binaries

| Component                        | Platform | Licence                  | Notes                                                                                                     |
| -------------------------------- | -------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| MPVKit (mpv + FFmpeg)            | iOS      | Must be LGPL for release | Current dev build is GPL - not shippable. See `app/modules/mpv/UPSTREAM.md`                               |
| libmpv (`dev.jdtech.mpv:libmpv`) | Android  | Must be LGPL for release | Current `1.0.0` is a GPL build (FFmpeg `--enable-gpl`) - not shippable. See `app/modules/mpv/UPSTREAM.md` |
