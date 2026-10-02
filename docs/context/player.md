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
  paused?: boolean;
  externalSubs?: { uri: string; lang?: string; title?: string }[];
  onLoad?(e: { duration: number; audio: Track[]; subs: Track[] }): void;
  onProgress?(e: { position: number; duration: number }): void;
  onEnd?(): void;
  onError?(msg: string): void;
};
export type PlayerRef = { seek(s: number): void; play(): void; pause(): void };
```

## Rules

- Keep playback position in a ref, not state.
- Keep `PlayerEngine` free of mpv-specific concepts (a second engine may come later).
- Sources: `PlaybackInfo` → check `SupportsDirectPlay` → static stream URL; external subtitle URLs built in the client (`docs/context/api.md`). mpv gets the token-only header (I1).
- Resume prompt only when the item has a server resume point (server keeps 5-90%, items ≥ 5 min).
- Reporting: `Sessions/Playing` (sets LastPlayedDate + PlayCount), `Progress` every 10s + on pause / seek (resume rules apply on every `Progress`), `Stopped`, all with `PlaySessionId`.
- Known engine issues to handle here (details + fix directions in the test plan): I3 stale first progress after a new load, I4 same URL ignored (`seek(0)` + `play()`), I8 no end event (EOF arrives as `isPaused: true`; after EOF a seek doesn't resume without `play()`), I11 premature EOF after long network drops (reload at saved position when EOF arrives with position < duration).
- Seeks snap to keyframes today (`hr-seek` off) - use exact seeks for scrubber / resume.
