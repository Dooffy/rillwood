# Play Console - foreground service declaration

Text and video script for **App content → Foreground service permissions** in Play Console. Required at targetSdk 34+ for every FGS type in the merged manifest ([Play 13392821](https://support.google.com/googleplay/android-developer/answer/13392821)). Background: `docs/research/background-downloads.md` §3, runner rules: `docs/context/downloads.md`.

## What we declare

| FGS type   | Declared by                                                                                                    | Used when                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `dataSync` | `modules/downloads` manifest: WorkManager `SystemForegroundService` merged with `dataSync` (`DownloadsWorker`) | Android 8-13 download runner; Android 14+ only when the UIDT job can't be scheduled (OEM / refused `schedule`) |

- Android 14+ normally uses a user-initiated data transfer (UIDT) job - `RUN_USER_INITIATED_JOBS` is a normal permission, no declaration.
- No other FGS type in the app. Re-check the merged manifest of the release AAB before submitting (`bundletool dump manifest --bundle=app.aab | grep -i foregroundServiceType`) - a new dependency could add one.

## Form answers

Play gives no character limits; keep each answer short.

**Tasks** (pick list): `Network transfer: Upload or download`.

**Description of the app functionality:**

> Download for offline viewing. The user taps Download on a movie, episode or season. The app downloads the original media file from the user's own Jellyfin media server into app-private storage, so it can be played later without a connection. A notification shows progress with a Pause action; tapping it opens the app. The service runs only for downloads the user started and stops when they finish, are paused or cancelled. On Android 14 and later the app uses user-initiated data transfer jobs instead; the foreground service is used on Android 8-13.

**User impact if the task is deferred** (doesn't start right away):

> The download starts later, so the file may not be ready when the user goes offline (for example before a flight). Large files (several GB) need the transfer to start while the user still has Wi-Fi.

**User impact if the task is interrupted** (paused and/or restarted):

> The download stops and the user waits longer for the file. Progress isn't lost: the app resumes from the same byte offset (HTTP Range) when it runs again. If the system stops it repeatedly, a multi-GB file may not finish before the user goes offline.

**Video link:** unlisted YouTube URL (see below).

## Video

Must show the steps a user takes to trigger the feature. Record against the review server (`docs/research/store-requirements.md` §C9), same build as the release.

| Setup        | Value                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Device       | Android 8-13 (the `dataSync` path) - e.g. the Android 12 test phone. On 14+ the notification comes from the UIDT job, not the FGS |
| Build        | Release (or release-like) APK / AAB from the submitted version                                                                    |
| Media        | Open-licence titles only (e.g. Tears of Steel, Big Buck Bunny) - no studio artwork on screen (IP policy, store-requirements.md)   |
| Account      | Non-admin review user with downloads on. Password field never readable on screen                                                  |
| Network      | Wi-Fi (default setting Wi-Fi only)                                                                                                |
| Notification | Permission granted (13: allow the prompt after the first download) so the progress notification shows in the drawer               |
| Recording    | Built-in screen recorder or `adb shell screenrecord --time-limit 180 /sdcard/fgs.mp4`; 1-2 min, no audio needed                   |
| Upload       | YouTube, unlisted; paste the link in the form. Keep it up as long as the app is on Play                                           |

Shot list:

1. Open Rillwood, already signed in to the review server (Home).
2. Open a movie → tap **Download** → the ring shows progress.
3. Swipe down: the **Downloading 1 item** notification with progress and **Pause**.
4. Press Home (app in the background) → reopen the shade: progress keeps going.
5. Tap **Pause** in the notification → reopen the app: the download shows paused → tap the ring → **Resume**.
6. Wait for it to finish (short title, or cut) → notification gone → **Downloads** tab shows it ready.
7. Optional: airplane mode on → play the downloaded title (after M6 offline playback; until then end on step 6).

Optional caption cards in the video: "User starts a download", "App in background - download continues", "User pauses / resumes", "Download complete".

## When to update

- Notification actions change (e.g. Cancel added) - update the description.
- Runner changes (FGS dropped on 8-13, another FGS type added) - update or remove the declaration.
- Each release: re-check the merged manifest (above).
