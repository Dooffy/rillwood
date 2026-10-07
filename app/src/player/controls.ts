// SPDX-License-Identifier: GPL-3.0-or-later
// Player controls logic (pure): seek steps, pull-down to close, scrubber maths.

export const SEEK_STEP = 10;
/** Controls hide after this long without a touch (not while paused, scrubbing or with VoiceOver on). */
export const HIDE_AFTER_MS = 3000;
/** The engine waits for data this long before the spinner shows (quick seeks don't flash it). */
export const STALL_SPINNER_MS = 500;
/** Pull down further than this, or flick down faster, to close the player. */
export const PULL_CLOSE_DISTANCE = 120;
/** The Up Next card shows for this long before the end of an episode that has a next one. */
export const UP_NEXT_SECONDS = 30;
/** Portrait shows the picture small and mpv sizes text to the picture: subtitles a step larger there. */
export const PORTRAIT_SUBTITLE_SCALE = 1.25;

/** Subtitle scale sent to the engine: the user's size, a step up in portrait. */
export const subtitleScaleFor = (scale: number, portrait: boolean) =>
  portrait ? scale * PORTRAIT_SUBTITLE_SCALE : scale;
const PULL_CLOSE_VELOCITY = 800;
/** A flick only counts once the pull has really started. */
const FLICK_MIN_DISTANCE = 30;

export function shouldClose(translationY: number, velocityY: number): boolean {
  'worklet';
  return translationY > PULL_CLOSE_DISTANCE || (translationY > FLICK_MIN_DISTANCE && velocityY > PULL_CLOSE_VELOCITY);
}

/** Seek target inside the file; an unknown duration (0) only clamps at the start. */
export function seekTarget(seconds: number, duration: number): number {
  const start = Math.max(0, seconds);
  return duration > 0 ? Math.min(start, duration) : start;
}

/** Position under a touch at `x` on a track `width` wide. */
export function positionAt(x: number, width: number, duration: number): number {
  if (width <= 0 || duration <= 0) return 0;
  return Math.min(Math.max(x / width, 0), 1) * duration;
}

/**
 * Up Next countdown in its last `UP_NEXT_SECONDS`: whole seconds `left` (the label) and how far the ring is filled
 * (`fill`, 0-1, from the exact position). Undefined before then, or without a duration yet.
 */
export function upNextCountdown(position: number, duration: number): { left: number; fill: number } | undefined {
  const left = duration - position;
  if (duration <= 0 || left > UP_NEXT_SECONDS) return undefined;
  return { left: Math.max(0, Math.ceil(left)), fill: Math.min(1, Math.max(0, 1 - left / UP_NEXT_SECONDS)) };
}
