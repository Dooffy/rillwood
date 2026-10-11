# Downloads - device test plan

Manual tests for `app/modules/downloads`. Run on a physical iPhone and an Android phone after any native change in the module.

Record per run: date, commit, device + OS, pass / fail per row, notes.

Runs: 2026-10-09 iPhone - D4 passed (3.77 GB at ~28 MB/s, progress every ~0.5 s, `done`, `getTasks()` empty after). D5 likely (daemon request authenticated - bytes flowed; server log check pending).

2026-10-10 iPhone - N4 passed (5 GB limit, Sintel 3.77 GB downloaded + Tears of Steel 1.86 GB → toast, nothing queued). A download stuck at "Waiting" with 0 bytes was cleared by a rebuild (not the limit).

## Scaffold

| #   | Test                                                            | Pass when                                                 |
| --- | --------------------------------------------------------------- | --------------------------------------------------------- |
| D1  | `npx expo prebuild --clean`, then build iOS + Android           | Builds with the `Downloads` pod / Gradle module linked    |
| D2  | Launch the app (iOS registers `DownloadsAppDelegateSubscriber`) | Starts and behaves as before                              |
| D3  | Temporary `Downloads.getTasks()` from any screen (don't commit) | Resolves `[]`, no "Cannot find native module 'Downloads'" |

## iOS transfers

Until the store + Downloads screen land, drive the module from a temporary snippet (don't commit): `Downloads.setCredential(accountId, { Authorization: <auth header> })`, then `Downloads.enqueue([{ id, accountId, url: <server>/Items/<id>/Download, dest: 'downloads/test/<name>.mkv', size: <MediaSource.Size> }], { cellular: false })`, log `progress` / `done` / `error` and `getTasks()`. Media: `dev/jellyfin` 12.1 + 10.11, a 20GB and a 60GB file.

| #   | Test                                                                                          | Pass when                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D4  | Enqueue one movie, keep the app open                                                          | `progress` ~every 0.5 s, `done`, file at `Documents/dest` with the server size, excluded from backup                                   |
| D5  | `Authorization` header on a background task (server log)                                      | Request authenticated, no 401; token not in the URL                                                                                    |
| D6  | Enqueue a season (one call), background the app, lock the phone                               | All episodes finish, at most 2 at a time; `done` events (or files present) on return                                                   |
| D7  | `exit(0)` from a debug build mid-download                                                     | Background relaunch finishes the file; `getTasks()` on open shows it gone, file present                                                |
| D8  | Force-quit from the app switcher mid-download, reopen                                         | Download restarts within ~2 s, from where it was if resume data came with the cancel (note which)                                      |
| D9  | Reboot mid-download, unlock                                                                   | Continues after first unlock                                                                                                           |
| D10 | Airplane mode mid-download, off again after 1 min                                             | Carries on (daemon waits); no `error`                                                                                                  |
| D11 | Pause, wait, resume                                                                           | Continues from the paused byte count (resume data)                                                                                     |
| D12 | Wi-Fi only, Wi-Fi off with cellular on                                                        | Waits; switch to Any network → continues on cellular, from 0 (expected for MVP - note if progress was kept)                            |
| D13 | Revoke the token in the dashboard mid-download                                                | `error` with status 401, `getTasks()` shows `paused` / `auth`; new credential + `resume` continues                                     |
| D14 | User without download permission (`EnableContentDownloading` off)                             | `error` status 403, no file written                                                                                                    |
| D15 | Replace the file on the server mid-download (pause, swap, resume)                             | Restarts or ends in `error` (size mismatch); never a mixed file at `dest`                                                              |
| D16 | Fill the disk to < file size, enqueue                                                         | `error` / `storage`, no partial file at `dest`                                                                                         |
| D17 | Fresh install (or first launch after this build), then `Documents/downloads` in the container | Folder has `isExcludedFromBackup` (Xcode: Devices → app container; or a debug `URLResourceValues` read) - snapshots inside are covered |

## Snapshot (JS, `src/downloadSnapshot.ts`)

| #   | Test                                                                          | Pass when                                                                                                 |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| S1  | Download a movie with external subtitles (`Sidecar Subs`)                     | Item folder holds `item.json`, `poster.jpg`, `backdrop.jpg`, `<source>.sub-<index>.srt` next to the video |
| S2  | Open a movie, airplane mode on, tap ↓; airplane mode off, background + reopen | Snapshot missing at first; after the foreground reconcile the files appear                                |
| S3  | Delete it                                                                     | The whole item folder is gone (with two versions: only the deleted one's video + subtitles)               |

## Downloads screen

| #   | Test                                                                                      | Pass when                                                                                      |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| L1  | Download a movie, then two episodes of one show                                           | One list, newest first: the show is one row ("2 episodes · size", ring while running), posters |
| L2  | Tap the show row                                                                          | Its episodes by season, "1. Title", rings live; back returns to the list                       |
| L3  | Swipe a movie row left, tap Delete, confirm; same on a show row                           | Asks first; the show's swipe deletes every episode; row closes again on Cancel                 |
| L4  | On a show's screen, delete its last episode                                               | Goes back to the tab, the show row is gone                                                     |
| L5  | Scroll the list with a finger, then swipe a row (VoiceOver: long press)                   | Vertical scroll never opens a row; VoiceOver reaches Delete through the long-press menu        |
| L6  | Episodes downloaded on a build before this one, open the tab after the update             | The show row has the show's real name (not "TV Show"), episodes numbered by season             |
| L7  | Episodes chip with a few shows downloaded, then search a show name, then an episode title | Every episode on its own row, newest first, "Show · S1:E3 · Title"; both searches narrow it    |
| L8  | 100+ downloads (or `Long Show`, 50 episodes): fling the tab list and a show's screen      | Scrolls smoothly, rings stay live, no blank rows after a fast fling                            |

## Cancel download

| #   | Test                                                                               | Pass when                                                                                               |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| C1  | Detail header: tap the ring while downloading, then while paused                   | Menu: Pause Download + Cancel Download (red); paused: Resume Download + Cancel; tap alone doesn't pause |
| C2  | Cancel Download on a running movie (Downloads row ring, then item menu on another) | Row gone at once, no question; no partial file left; ↓ again on the detail                              |
| C3  | Season with 1 episode done + 1 downloading: header ring → Cancel Download          | The running one is gone, the done one stays; Delete Download in the same menu asks first                |

## Sign out

| #   | Test                                                                            | Pass when                                                                                                                                |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | iPhone: one movie downloading, one paused, one done; sign out (Accounts)        | Transfer stops at once (server log), no `<id>.resume` left in `Application Support/Downloads`; rows "Paused - sign in again", done stays |
| O2  | Then sign in again + Resume on the row                                          | Starts from 0 with the new token (server log: no `Range`), finishes                                                                      |
| O3  | Android: same as O1 + O2                                                        | Transfer stops at once; sign in + Resume carries on from the `.part` (`Range`)                                                           |
| O4  | Remove the account (Accounts) with a download running, then force-quit + reopen | Transfer stays stopped (no native task for it after `getTasks()`); a second account's downloads keep running                             |

## Settings (network + storage limit)

| #   | Test                                                                                   | Pass when                                                                              |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| N1  | Settings → Network → Any network, Wi-Fi off, download a movie (then D12 the other way) | Downloads on cellular; back to Wi-Fi only → "Waiting for Wi-Fi"                        |
| N2  | Set Any network, force-quit, relaunch with Wi-Fi off                                   | Still Any network, the queued download carries on over cellular                        |
| N3  | Storage limit: drag, − / +, VoiceOver swipe up / down                                  | Stops from 5 GB to No limit, saved on release, Settings row shows it                   |
| N4  | Limit below what's downloaded + a new movie, tap ↓                                     | Toast "over your download storage limit", nothing queued; existing downloads stay      |
| N5  | Wi-Fi only, Wi-Fi off (cellular on), tap ↓ on a movie                                  | Row says "Waiting for Wi-Fi" at once; Wi-Fi on → Downloading                           |
| N6  | Wi-Fi only, mid-download turn Wi-Fi off for 5+ min, then on                            | "Waiting for Wi-Fi" (not Failed - network); carries on from where it was               |
| N7  | Any network, airplane mode mid-download, off again                                     | "Waiting for network", then Downloading (Wi-Fi only on a hotspot: "Waiting for Wi-Fi") |

## Android transfers (in-process queue)

App open (no background runner yet). Files: `adb shell run-as app.rillwood.client ls -l files/downloads/...` (`.part` while running), state: `run-as ... cat no_backup/downloads/state.json` (debug build).

| #   | Test                                                                   | Expect                                                                                                    |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A1  | Enqueue one movie, keep the app open                                   | `progress` ~every 0.5 s, `done`, file at `files/<dest>` with the server size, no `.part` left             |
| A2  | Enqueue a season                                                       | At most 2 at a time, in episode order; all finish                                                         |
| A3  | Pause, wait, resume (server log or proxy)                              | Resume request has `Range: bytes=<n>-` + `If-Range`, 206; carries on from the paused byte count           |
| A4  | `adb shell am force-stop app.rillwood.client` mid-download, reopen     | Carries on from the `.part` (not 0); `credentials` file in `no_backup/downloads` is binary, no token text |
| A5  | Airplane mode mid-download, off again after 1 min                      | "Waiting for network", no `error`; carries on from where it was                                           |
| A6  | Wi-Fi only, Wi-Fi off with mobile data on; then Settings → Any network | "Waiting for Wi-Fi" at once; Any network → continues on mobile data, progress kept                        |
| A7  | Revoke the token in the dashboard mid-download                         | `error` 401, `paused` / `auth`; sign in again + resume carries on from the `.part`                        |
| A8  | User without download permission (`EnableContentDownloading` off)      | `error` 403, no file written                                                                              |
| A9  | Replace the file on the server mid-download (pause, swap, resume)      | 200 → starts again from 0 (or `error` size mismatch); never a mixed file at `dest`                        |
| A10 | Fill the disk to < file size, enqueue                                  | `error` / `storage`, no file at `dest`                                                                    |

## Android 14+ background (UIDT job)

Android 14+ device or emulator. Job state: `adb shell dumpsys jobscheduler | grep -A20 app.rillwood.client`.

| #   | Test                                                                             | Expect                                                                                                 |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| U1  | Download a movie, go home, lock the phone for 10 min                             | Notification "Downloading 1 item", "x of y" + bar; finishes; notification gone at the end              |
| U2  | Download a season, background the app                                            | "Downloading N items", 2 at a time; job ends after the last one (`dumpsys`: no job)                    |
| U3  | Notification → Pause                                                             | Every download Paused (app shows it, also when open); job ends; resume in the app starts the job again |
| U4  | Mid-download `adb shell am kill app.rillwood.client` (app in the background)     | The job restarts the queue without opening the app; carries on from the `.part`                        |
| U5  | Reboot mid-download, unlock                                                      | Job runs again (persisted) and carries on                                                              |
| U6  | Settings → Task Manager (notification shade, active apps) → Stop                 | Downloads Paused - not Failed; opening the app + resume continues                                      |
| U7  | Wi-Fi only, background the app, Wi-Fi off (mobile data on); Wi-Fi on after 2 min | "Waiting for Wi-Fi" in the notification (or the job stops until Wi-Fi); carries on once Wi-Fi is back  |
| U8  | Notification permission denied (Android 13+), download a movie in the background | Finishes; nothing in the shade, the job shows in Task Manager                                          |

## Notification permission (Android 13+)

| #   | Test                                                  | Expect                                                                                   |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P1  | Fresh install, tap ↓ on a movie                       | Download starts, then the system asks "Allow notifications?"; Allow → notification shows |
| P2  | Fresh install, ↓, Don't allow; download another movie | Both download; never asked again; nothing in the shade (Task Manager only, Android 14+)  |
| P3  | Android 12 phone, ↓                                   | No prompt, download starts                                                               |

## To add with the Android runners (M5)

OS kill, reboot, 20GB + 60GB file, Task Manager stop (Android 14+), dataSync timeout (`device_config ... data_sync_fgs_timeout_duration`), Android 16 standby buckets (`am set-standby-bucket`).
