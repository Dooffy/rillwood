// SPDX-License-Identifier: GPL-3.0-or-later
// Player controls logic (pure): seek steps, pull-down to close, scrubber maths, zoom.
import type { EdgeInsets } from 'react-native-safe-area-context';

import type { VideoZoom } from './Player';

export const SEEK_STEP = 10;
/** Controls hide after this long without a touch (not while paused, scrubbing or with VoiceOver on). */
export const HIDE_AFTER_MS = 3000;
/** The engine waits for data this long before the spinner shows (quick seeks don't flash it). */
export const STALL_SPINNER_MS = 500;
/** Pull down further than this, or flick down faster, to close the player. */
export const PULL_CLOSE_DISTANCE = 120;
/** The Up Next card shows for this long before the end of an episode that has a next one. */
export const UP_NEXT_SECONDS = 30;
/** iOS: how long the pause on leave waits for picture in picture to start (`onPipChange` usually comes first). */
export const PIP_GRACE_MS = 500;
/** Portrait shows the picture small and mpv sizes text to the picture: subtitles a step larger there. */
export const PORTRAIT_SUBTITLE_SCALE = 1.25;

/** Subtitle scale sent to the engine: the user's size, a step up in portrait. */
export const subtitleScaleFor = (scale: number, portrait: boolean) =>
  portrait ? scale * PORTRAIT_SUBTITLE_SCALE : scale;
/** A pinch past these scales switches the zoom: apart = fill, together = fit. */
const PINCH_FILL_SCALE = 1.1;
const PINCH_FIT_SCALE = 0.9;

/** Zoom after a pinch that ended at `scale`; a small pinch keeps the current one. */
export function zoomAfterPinch(scale: number, current: VideoZoom): VideoZoom {
  if (scale >= PINCH_FILL_SCALE) return 'fill';
  if (scale <= PINCH_FIT_SCALE) return 'fit';
  return current;
}

/**
 * Where the video sits. Fill covers the whole screen. Fit keeps the picture clear of the notch / Dynamic Island: inset by
 * the safe area on the long sides (landscape: left / right, portrait: top / bottom), the same on both so the picture
 * stays centred. Landscape keeps the full height (the home indicator may sit over the picture's bottom edge, as in
 * other players); a one-sided inset (Android nav bar) narrows both sides.
 */
export function videoFrame(insets: EdgeInsets, landscape: boolean, zoom: VideoZoom): EdgeInsets {
  if (zoom === 'fill') return { top: 0, bottom: 0, left: 0, right: 0 };
  if (landscape) {
    const side = Math.max(insets.left, insets.right);
    return { top: 0, bottom: 0, left: side, right: side };
  }
  const end = Math.max(insets.top, insets.bottom);
  return { top: end, bottom: end, left: 0, right: 0 };
}

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

/** Subtitle timing range (seconds either way) and its step: the slider snaps to it, − / + move by it. */
export const SUBTITLE_DELAY_MAX = 10;
export const SUBTITLE_DELAY_STEP = 0.1;

/** A subtitle delay inside the range, on a step (no float drift: 0.1 + 0.2 = 0.3). */
export function clampDelay(seconds: number): number {
  const steps = 1 / SUBTITLE_DELAY_STEP;
  const clamped = Math.min(Math.max(seconds, -SUBTITLE_DELAY_MAX), SUBTITLE_DELAY_MAX);
  // Divided by a whole number of steps, so the result is an exact decimal - and never -0.
  return Math.round(clamped * steps) / steps || 0;
}

/** Subtitle delay under a touch at `x` on a slider `width` wide: the middle is in sync, left earlier, right later. */
export function delayAt(x: number, width: number): number {
  if (width <= 0) return 0;
  return clampDelay(positionAt(x, width, 2 * SUBTITLE_DELAY_MAX) - SUBTITLE_DELAY_MAX);
}

/** Where a subtitle delay sits along the slider, 0-1 (the reverse of `delayAt`). */
export const delayFraction = (seconds: number) =>
  Math.min(Math.max((seconds + SUBTITLE_DELAY_MAX) / (2 * SUBTITLE_DELAY_MAX), 0), 1);
