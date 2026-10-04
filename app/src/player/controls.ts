// SPDX-License-Identifier: GPL-3.0-or-later
// Player controls logic (pure): seek steps, pull-down to close, scrubber maths, chapter marks.
import type { ChapterInfoDto } from '@/api';
import { ticksToSeconds } from '@/items';

export const SEEK_STEP = 10;
/** Controls hide after this long without a touch (not while paused, scrubbing or with VoiceOver on). */
export const HIDE_AFTER_MS = 3000;
/** Pull down further than this, or flick down faster, to close the player. */
export const PULL_CLOSE_DISTANCE = 120;
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

/** Chapter starts as fractions of the duration, inside the track (0 and the end left out). */
export function chapterMarks(chapters: ChapterInfoDto[] | undefined, duration: number): number[] {
  if (!chapters || duration <= 0) return [];
  return chapters.map((c) => ticksToSeconds(c.StartPositionTicks) / duration).filter((f) => f > 0 && f < 1);
}
