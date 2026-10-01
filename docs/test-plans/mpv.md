# mpv player - device test plan

Manual tests for `app/modules/mpv`. Run on a physical iPhone and an Android phone after: vendoring or syncing upstream (`/update-modules`), any MPVKit / libmpv bump, any native change in the module.

Media: `dev/jellyfin/make-test-media.sh` output on the `dev/jellyfin` 12.1 server, plus `real/` (DV P8, PGS, 4K remux).

Record per run: date, commit, device + OS, MPVKit / libmpv versions, pass / fail per row, notes.

## Sources

| #   | Test                                                                          | Pass when                      |
| --- | ----------------------------------------------------------------------------- | ------------------------------ |
| S1  | HTTP stream `GET /Videos/{id}/stream?static=true` with `Authorization` header | Plays; no token in URL or logs |
| S2  | Local file in `Paths.document` (`file://`)                                    | Plays offline (flight mode)    |
| S3  | Wrong / revoked token                                                         | Clean error event, no crash    |

## Codec matrix

| #   | Video       | Audio  | Subs                                               | Pass when                                                    |
| --- | ----------- | ------ | -------------------------------------------------- | ------------------------------------------------------------ |
| C1  | H.264       | AAC    | SRT                                                | Plays, subs render                                           |
| C2  | HEVC 10-bit | AC3    | ASS                                                | Plays, ASS styling kept                                      |
| C3  | HDR10       | DTS    | -                                                  | Plays, HDR or correct tone-map                               |
| C4  | DV P8       | TrueHD | PGS                                                | Plays, PGS render                                            |
| C5  | AV1         | AAC    | -                                                  | Plays (hw or sw decode)                                      |
| C6  | H.264       | AAC    | External SRT (sidecar URL)                         | Loads and switches                                           |
| C7  | H.264       | AAC    | SRT: jpn, zho, kor, ara, heb ("Multi Script Subs") | All scripts render (no boxes), Arabic / Hebrew right-to-left |

## Behaviour

| #   | Test                                                | Pass when                                    |
| --- | --------------------------------------------------- | -------------------------------------------- |
| B1  | Seek forward / back, scrub to end                   | Position correct within 1s, no freeze        |
| B2  | Switch audio track during playback                  | Switches without restart                     |
| B3  | Switch / disable subtitle track                     | Switches; off hides subs                     |
| B4  | Background app, wait 30s, foreground                | Resumes or stays paused, video not black     |
| B5  | Lock screen during playback                         | No crash on unlock                           |
| B6  | 4K remux, 10 min playback                           | No memory warning / OS kill, smooth playback |
| B7  | Leave player screen mid-playback, open another item | Previous instance torn down, new one plays   |
| B8  | Play to end                                         | End event fires once                         |

## Platform

| #   | Test                                   | Pass when                     |
| --- | -------------------------------------- | ----------------------------- |
| P1  | iOS Simulator smoke (S1, C1)           | Plays (sw decode OK)          |
| P2  | Android emulator smoke (S1, C1)        | Plays                         |
| P3  | iOS release archive (Xcode 27, SDK 58) | Archive builds (CLAUDE.md §9) |

## How to run

- Dev build on the device, `dev/jellyfin` reachable on the LAN (`RILLWOOD_BIND=0.0.0.0`, see `dev/jellyfin/README.md`).
- Test screen: the M0 spike screen is throwaway and not in `main`. Any test screen needs: login to `dev/jellyfin`, per item Stream / Download / Play local, seek, pause, audio and subtitle track pickers, and a technical info dump (`getTechnicalInfo`: codec, `hwdec`, dropped frames).
- Logs: subscribe to the module's `onNativeLog` event (mpv warnings / errors) plus `AppState` changes. Metro drops while the app is backgrounded, so also append to a file in `Documents` and pull it over USB:
  ```bash
  xcrun devicectl device copy from --device <udid> --domain-type appDataContainer \
    --domain-identifier app.rillwood.client --source Documents/<log file> --destination log.txt
  ```

## Results

### 2026-10-01 - iPhone 15 Pro Max, iOS 27.0.1, MPVKit 0.41.0-av5 (GPL spike build), main @ 073953a + local spike screen

Generated media only (no `real/` files yet). ✅ pass, ⚠️ pass with issue, ❌ fail, ⏳ not run.

| Row | File / test              | Result | Notes                                                                                        |
| --- | ------------------------ | ------ | -------------------------------------------------------------------------------------------- |
| S1  | Stream with auth header  | ✅     | After fix: token-only header (see I1)                                                        |
| S2  | Local file (`file://`)   | ✅     | H264 DTS downloaded via `/Items/{id}/Download`, played from Documents. Flight mode not tried |
| S3  | Revoked token            | ⏳     | Jellyfin 12.1 serves static streams without auth, so a bad token may still play              |
| C1  | H264 AAC SRT             | ✅     | videotoolbox, subs on / off                                                                  |
| C2  | HEVC 10bit AC3 ASS       | ✅     | videotoolbox p010, Cyrillic ASS renders (system font fallback)                               |
| C3  | HEVC HDR10 EAC3          | ✅     | Real HDR on screen (EDR), E-AC3 5.1 downmixed to stereo                                      |
| -   | H264 DTS                 | ✅     | mpv decodes DTS                                                                              |
| -   | H264 TrueHD              | ✅     | mpv decodes TrueHD (s32 out)                                                                 |
| C4  | DV P8 + PGS              | ⏳     | Needs `real/` files                                                                          |
| C5  | AV1 AAC                  | ✅     | Hardware AV1 (A17 Pro). Older iPhones fall back to sw - test later                           |
| C6  | External SRT             | ⏳     |                                                                                              |
| C7  | Multi Script Subs        | ⏳     | Added after this run (I6)                                                                    |
| -   | 4K HEVC 10bit            | ✅     | videotoolbox p010, 0 dropped, seek ~45 ms                                                    |
| B1  | Seek ±10s                | ✅     |                                                                                              |
| B2  | Audio track switch       | ✅     | AAC 440Hz -> AC3 880Hz and back, no restart                                                  |
| B3  | Subtitle switch / off    | ✅     | ~0.4-0.6 s reload blip per switch                                                            |
| B4  | Background / foreground  | ⚠️     | Resumes, but see I2                                                                          |
| B5  | Lock during playback     | ⚠️     | No crash; same as I2                                                                         |
| B6  | 4K remux 10 min          | ⏳     | Needs `real/` file                                                                           |
| B7  | Switch item mid-playback | ✅     | New item loads; same URL is ignored (I4)                                                     |
| B8  | End event                | ⏳     |                                                                                              |
| P3  | Release archive Xcode 27 | ⏳     |                                                                                              |

Bluetooth A2DP <-> speaker route change mid-playback: ✅.

### Issues found

| #   | Issue                                                                                                                                                            | Impact                                                                         | Fix direction                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| I1  | mpv joins headers into comma-separated `http-header-fields`; the full `MediaBrowser Client=.., Device=.., Token=..` header splits into invalid lines -> HTTP 400 | Every auth'd stream failed                                                     | Fixed in JS: streams send `Authorization: MediaBrowser Token="..."` (no commas). Keep in `api.ts` / PlayerEngine (M4)   |
| I2  | In background iOS invalidates the VideoToolbox session; mpv falls back to **software decode for the rest of the file**, mid-GOP -> black until next keyframe     | 4K / HDR on sw decode: battery, heat, stutter on real remuxes, HDR at risk     | Pause + stop video on background; on foreground reload at saved position with hwdec. Native module or PlayerEngine (M4) |
| I3  | First `onProgress` after loading a new file carries the previous file's position                                                                                 | Resume could save a wrong position                                             | Ignore progress until the new file reports loaded (M4)                                                                  |
| I4  | Setting a source with the same URL is ignored                                                                                                                    | "Play from start" / replay does nothing                                        | Seek to 0 instead of re-setting source (M4)                                                                             |
| I5  | Module HDR detection logs `sdr` for HDR10 (runs before mpv has colour info)                                                                                      | Cosmetic - output is HDR                                                       | Re-check after `video-params` known, or ignore                                                                          |
| I6  | Bundled Noto subtitle fonts missing (NotoSans, Arabic, Hebrew, CJK)                                                                                              | Cyrillic OK via system fallback; Arabic / Hebrew / CJK untested - test with C7 | Bundle fonts or drop the lookup                                                                                         |
| I7  | One SIGSEGV in RN `Scheduler::uiManagerDidDispatchCommand` (native view command) during dev reloads                                                              | Dev-only so far, RN 0.88 RC                                                    | Watch for it in M4; report upstream if it repeats                                                                       |

Gate (CLAUDE.md §8 M0, >2 blockers -> swap to `expo-libvlc-player`): **0 blockers** so far. I2 is the one to fix before M4 ships.
