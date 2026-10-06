# mpv native module

Read before working on `modules/mpv/` (native player code, `app.plugin.js`, binaries). Vendored MPL-2.0 module: upstream, commit, local changes and binaries in [`app/modules/mpv/UPSTREAM.md`](../../app/modules/mpv/UPSTREAM.md). `app.plugin.js` is our own (GPL-3.0-or-later).

## Rules

- Vendored files keep their headers and stay diffable against upstream (excluded from Prettier). Record every local change in `UPSTREAM.md`; sync with `/update-modules`.
- After any native change, MPVKit / libmpv bump or upstream sync: run the device test plan [`docs/test-plans/mpv.md`](../test-plans/mpv.md) on a physical iPhone and Android phone.
- Binaries: MPVKit (iOS, podspec URL in `app.plugin.js`) and `dev.jdtech.mpv:libmpv` (Android, `android/build.gradle`) are GPL builds today; LGPL rebuild post-MVP (root §7, `docs/open-items.md`). Update `THIRD_PARTY_NOTICES.md` with every binary change.
- Android NDK: `app.plugin.js` pins `ndkVersion` to the NDK libmpv was built with (`LIBMPV_NDK_VERSION`). An older app NDK packs an older `libc++_shared.so` and libmpv fails to load (I9). Re-check on every libmpv / RN bump: `strings libmpv.so | grep "clang version"`.
- Release builds keep the JNI classes via libmpv's consumer rule (`-keep class dev.jdtech.mpv.MPVLib { *; }`); verify playback on a release build after bumps.
- Logs: mpv's verbose log prints `http-header-fields` incl. the token (I13) - never ship that log level; redact `Token=` in log forwarding.
- Network options planned for M4 (I11): `network-timeout=15`, `stream-lavf-o=reconnect=1,reconnect_on_network_error=1,reconnect_delay_max=30` (a lower max shortens the retry window). Demuxer caps 64-100 / 32 MiB for 4K remuxes.
- `keep-open=always` on both platforms: at EOF mpv pauses on the last frame (seek back works). The end is the `eof-reached` property -> `onPlaybackEnd` view event, dropped while a new load is pending (iOS load generation, Android `isReadyToSeek` - false from `load()` to `FILE_LOADED`); on iOS the engine also takes its own pause state along (PiP, Now Playing). `END_FILE` only means stop / replace / error (I8, I15).
- iOS background: VideoToolbox is invalidated in background (I2) - `vid=no` on scene background, `vid=auto` on foreground.
