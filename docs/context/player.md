# Player (JS)

Read before working on `src/player/` (`PlayerEngine` interface, mpv adapter) or the player screen. Native side: `docs/context/mpv.md`. Device results + open issues: [`docs/test-plans/mpv.md`](../test-plans/mpv.md).

## PlayerEngine contract

Screens never import mpv directly.

```ts
export type Track = {
  id: number;
  lang?: string;
  title?: string;
  codec?: string;
};
export type PlayerProps = {
  source: { uri: string; headers?: Record<string, string> };
  startSeconds?: number;
  audioTrack?: number;
  subtitleTrack?: number; // -1 = off
  speed?: number; // 1 = normal
  subtitleScale?: number; // 1 = normal
  paused?: boolean;
  externalSubs?: { uri: string; lang?: string; title?: string }[];
  onLoad?(e: { duration: number; audio: Track[]; subs: Track[] }): void;
  onProgress?(e: { position: number; duration: number }): void;
  onEnd?(): void; // end of file: last frame held, paused; play replays from 0, a seek moves away
  onError?(msg: string): void;
};
export type PlayerRef = { seek(s: number): void; play(): void; pause(): void };
```

## Rules

- Keep playback position in a ref, not state.
- Keep `PlayerEngine` free of mpv-specific concepts (a second engine may come later).
- Sources (`src/playback.ts`, pure): `getPlaybackInfo` (`src/api.ts`, body = `playbackInfoBody(mediaSourceId)` with `DEVICE_PROFILE`) → `playSource` picks the requested version (else the first), refuses on `ErrorCode` (`NotAllowed` → its own message) or `SupportsDirectPlay` not true, and returns `{source: {uri, headers}, externalSubs, playSessionId, defaultAudio, defaultSubtitle}` - static stream URL, sidecar text subtitles (srt / subrip → `.srt`, ass / ssa → `.ass`, vtt → `.vtt`; image sidecars skipped - a `defaultSubtitle` pointing at one has no track to match) built in the client, never `DeliveryUrl`. mpv gets the token-only header `streamAuthHeader` (I1). Errors: `playErrorMessage`.
- Resume prompt only when the item has a server resume point (server keeps 5-90%, items ≥ 5 min).
- Reporting (`src/player/useReporting.ts`, bodies from `playbackReport` in `src/playback.ts`): `Sessions/Playing` once mpv loaded the file (sets LastPlayedDate + PlayCount), `Progress` every 10 s (paused too, with `IsPaused` - the server ends sessions that stop checking in) + on pause / unpause / seek / app going to the background (resume rules apply on every `Progress`), `Stopped` with the last position when the load ends (close, Retry, error), all with `PlaySessionId`, `PlayMethod: DirectPlay`, sent in order per session (one queue: a late `Progress` never lands after `Stopped`). After `Stopped` the fetch cache refetches (resume point, Continue Watching, Next Up). Best effort: failed reports are dropped (offline progress: `docs/context/sync.md`).
- mpv adapter (`src/player/mpv.tsx`, the only importer of `modules/mpv`): a new `source` object = a new load; start, autoplay and first audio / subtitle track are read at that moment, later `paused` / track changes call mpv. `onLoad` fires once per load on mpv's first tracks-ready with duration + tracks (mpv track ids; sidecar subs may not be listed yet - re-read tracks when the tracks sheet opens). Only a new `source` is a new load. End (I8): the native `onPlaybackEnd` (mpv `eof-reached`, `keep-open=always` on both platforms) becomes a last `onProgress` at the duration + `onEnd` once per end, once the load is ready - an EOF of the previous file is dropped (native load guard + JS `ready`), never gated on playing (mpv pauses itself at EOF). After the end `play()` / `paused=false` seeks to 0 first, unless a seek (ours, or progress from a lock-screen seek) moved away. Never call `destroy()` on unmount: the native view tears mpv down itself (iOS `deinit`, Android detach); on iOS `destroy()` stops and restarts mpv for view reuse - wasted work before the view goes away.
- Player screen (`src/app/player.tsx`, params `id` + `start`): PlaybackInfo → `playSource` (aborted on leave, keyed per account + item + attempt), spinner until the player's `onLoad` or `onError` (no load timeout - a failed open is mpv's own error, I15), refusal / load / playback errors as `Message` + Retry; Retry reloads from the last progress position. End of file: `paused` (the pause report sends the end - the server marks it played), controls up; Play replays.
- Player UI (`src/app/player.tsx` + `PlayerControls`), Apple TV style: video only until a tap; the overlay hides after 3 s, never while paused, scrubbing or with a screen reader on. Controls sit on glass (`Glass`: Liquid Glass on iOS 26+, translucent elsewhere), no dimming layer: close chevron-down + title pill on top, ⟲10 / play-pause (large) / 10⟳, scrubber panel with elapsed / remaining. Before playback starts (loading / error) only the top bar shows. Status bar hides with the overlay. Rotates freely; every other screen stays upright portrait (`expo-screen-orientation`: the player unlocks on mount, re-locks `PORTRAIT_UP` on unmount).
- Gestures (gesture-handler, own `GestureHandlerRootView` in the modal): single tap toggles the overlay (only while playing - before that the top bar is always up), double-tap left / right half = ±10s (both on JS, `runOnJS`). Pull down to close runs on the UI thread (reanimated worklets): the video follows the finger, shrinks, fades (to 35%) and rounds its corners, the player's own black backdrop fades so the screen below shows through (the route is a `transparentModal`); past 120 pt a "Release to close" pill shows, dragging back up hides it; release past it (or a flick) slides out and closes, otherwise it springs back. Sideways drags fail the pull (scrubber).
- Tracks (`playSource` → `audio` / `subtitles` as `TrackOption {id, index, label}`): `id` is mpv's track id, computed from Jellyfin's streams before load - each type numbered from 1 in file order (embedded), then the sidecar subtitles in the order they're added (`externalSubs`; image sidecars aren't loaded and get no id). Jellyfin lists sidecars first (`#0`), so never use its index as an mpv id. The player starts with the server's defaults (`DefaultAudio/SubtitleStreamIndex`, i.e. the user's language preferences) as mpv ids; no default subtitle = off. Labels are Jellyfin's `DisplayTitle` (else Title / Language / Codec) without "Default". Tracks menu (`TracksMenu` on `ActionSheet`, top-bar "⋯" button, spoken "Audio, subtitles and speed", keeps the controls up while open): Audio, Subtitles (incl. Off and sidecars), Speed (0.5-2×), Subtitle size (Small 0.8 - Extra large 1.5; portrait sends it 1.25x larger - mpv sizes text to the picture, which is small in portrait: `subtitleScaleFor`). Choices last for the screen (survive Retry; the menu itself closes). Speed and subtitle size are mpv-wide: the adapter sends them on change and again on every load (Android has no renderer before the file loads). Subtitle timing: not yet (no `setSubtitleDelay` in the Android module).
- Scrubber seeks on release (shows the drag position meanwhile); VoiceOver: adjustable, swipe up / down = ±10s, escape gesture closes. Position + duration live in `src/player/progress.ts` (not React state).
- Known engine issues (details + fix directions in the test plan): I3 stale first progress after a new load (handled: progress dropped until that load's tracks are ready), I4 same URL ignored (handled: same URL in a new source → `seekTo(start)` + `play()`), I8 end event (handled: `onEnd`, see the adapter rule above), I11 premature EOF after long network drops (reload at saved position when EOF arrives with position < duration).
- Seeks snap to keyframes today (`hr-seek` off) - use exact seeks for scrubber / resume.
