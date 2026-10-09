# Downloads - device test plan

Manual tests for `app/modules/downloads`. Run on a physical iPhone and an Android phone after any native change in the module.

Record per run: date, commit, device + OS, pass / fail per row, notes.

## Scaffold

| #   | Test                                                            | Pass when                                                 |
| --- | --------------------------------------------------------------- | --------------------------------------------------------- |
| D1  | `npx expo prebuild --clean`, then build iOS + Android           | Builds with the `Downloads` pod / Gradle module linked    |
| D2  | Launch the app (iOS registers `DownloadsAppDelegateSubscriber`) | Starts and behaves as before                              |
| D3  | Temporary `Downloads.getTasks()` from any screen (don't commit) | Resolves `[]`, no "Cannot find native module 'Downloads'" |

## To add with the native transfer work (M5)

Force-quit (iOS: cancelled → re-enqueue), `exit(0)` relaunch, OS kill, reboot, airplane mode, 20GB + 60GB file, server file replaced mid-download (If-Range → 200), token revoked, low disk, Task Manager stop (Android 14+), dataSync timeout (`device_config ... data_sync_fgs_timeout_duration`), Android 16 standby buckets (`am set-standby-bucket`), notification permission denied, `Authorization` header on an iOS background task.
