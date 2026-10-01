# mpv player - device test plan

Manual tests for `app/modules/mpv`. Run on a physical iPhone and an Android phone after: vendoring or syncing upstream (`/update-modules`), any MPVKit / libmpv bump, any native change in the module.

Media: `dev/jellyfin/make-test-media.sh` output on the `dev/jellyfin` 12.1 server, plus `real/` (DV P8, PGS, 4K remux).

Record per run: date, commit, device + OS, MPVKit / libmpv versions, pass / fail per row, notes.

## Sources

| # | Test | Pass when |
|---|---|---|
| S1 | HTTP stream `GET /Videos/{id}/stream?static=true` with `Authorization` header | Plays; no token in URL or logs |
| S2 | Local file in `Paths.document` (`file://`) | Plays offline (flight mode) |
| S3 | Wrong / revoked token | Clean error event, no crash |

## Codec matrix

| # | Video | Audio | Subs | Pass when |
|---|---|---|---|---|
| C1 | H.264 | AAC | SRT | Plays, subs render |
| C2 | HEVC 10-bit | AC3 | ASS | Plays, ASS styling kept |
| C3 | HDR10 | DTS | - | Plays, HDR or correct tone-map |
| C4 | DV P8 | TrueHD | PGS | Plays, PGS render |
| C5 | AV1 | AAC | - | Plays (hw or sw decode) |
| C6 | H.264 | AAC | External SRT (sidecar URL) | Loads and switches |

## Behaviour

| # | Test | Pass when |
|---|---|---|
| B1 | Seek forward / back, scrub to end | Position correct within 1s, no freeze |
| B2 | Switch audio track during playback | Switches without restart |
| B3 | Switch / disable subtitle track | Switches; off hides subs |
| B4 | Background app, wait 30s, foreground | Resumes or stays paused, video not black |
| B5 | Lock screen during playback | No crash on unlock |
| B6 | 4K remux, 10 min playback | No memory warning / OS kill, smooth playback |
| B7 | Leave player screen mid-playback, open another item | Previous instance torn down, new one plays |
| B8 | Play to end | End event fires once |

## Platform

| # | Test | Pass when |
|---|---|---|
| P1 | iOS Simulator smoke (S1, C1) | Plays (sw decode OK) |
| P2 | Android emulator smoke (S1, C1) | Plays |
| P3 | iOS release archive (Xcode 27, SDK 58) | Archive builds (CLAUDE.md §9) |
