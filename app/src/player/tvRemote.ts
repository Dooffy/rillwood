// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV remote in the player (screen draft 10), as pure logic: what an event from the remote does, given whether
// the controls are up and where focus is. Click / Play-Pause = play or pause; Left / Right click = -10 / +10 s, held =
// keeps seeking, faster the longer it's held (unless focus is on the track buttons, where they move focus); a swipe on
// the touch surface scrubs; anything else shows the controls. Menu (Back) is handled by the screen: hide the controls,
// then close.
import { SEEK_STEP } from './controls';

/** One event as `useTVEventHandler` delivers it. */
export type RemoteEvent = {
  eventType: string;
  /** 0 = key down, 1 = key up (presses fire both; we act on the release). Typed a string, sent a number. */
  eventKeyAction?: number | string;
  body?: { state?: string; x?: number } | null;
};

export type RemoteState = {
  /** The controls are on screen. */
  shown: boolean;
  /** Focus is on the scrubber (not the track buttons): Left / Right seek instead of moving focus. */
  onScrubber: boolean;
};

export type RemoteAction =
  | { type: 'toggle' }
  | { type: 'seekBy'; seconds: number }
  | { type: 'show' }
  /** Left / Right held (`longLeft` / `longRight`, sent once the press is long): seek again and again until let go. */
  | { type: 'holdStart'; direction: -1 | 1 }
  | { type: 'holdEnd' }
  | { type: 'scrub'; phase: 'start' | 'move' | 'end'; dx: number };

/** Seconds a swipe moves per point of travel on the touch surface: a full swipe is a few minutes. */
export const SCRUB_SECONDS_PER_POINT = 0.2;
/** Less travel than this is a touch, not a scrub. */
export const SCRUB_MIN_POINTS = 20;

/** A held Left / Right seeks this often. */
export const HOLD_REPEAT_MS = 300;
/** A Left / Right click this soon after a hold is the hold's own release: no extra 10 s. */
export const HOLD_CLICK_GRACE_MS = 500;

/** Left / Right seek (click or hold) with the controls down or focus on the scrubber; else they move focus. */
export function seeksOnLeftRight({ shown, onScrubber }: RemoteState): boolean {
  return !shown || onScrubber;
}

/** Seconds one repeat of a hold moves, by how long it's been held: 10 s, after 2 s 30 s, after 5 s 60 s. */
export function holdStep(elapsedMs: number): number {
  if (elapsedMs < 2000) return SEEK_STEP;
  if (elapsedMs < 5000) return 30;
  return 60;
}

export function remoteAction(event: RemoteEvent, state: RemoteState): RemoteAction | undefined {
  const { shown } = state;
  const key = event.eventKeyAction === undefined ? undefined : Number(event.eventKeyAction);
  if (event.eventType === 'longLeft' || event.eventType === 'longRight') {
    // 0 = the hold began, 1 = let go; moves while held come without a key action.
    if (key === 0) {
      return seeksOnLeftRight(state)
        ? { type: 'holdStart', direction: event.eventType === 'longLeft' ? -1 : 1 }
        : undefined;
    }
    return key === 1 ? { type: 'holdEnd' } : undefined;
  }
  if (key === 0) return undefined;
  switch (event.eventType) {
    case 'playPause':
      return { type: 'toggle' };
    case 'select':
      // Controls up: the focused control takes the click (the scrubber plays / pauses, a button opens its menu).
      return shown ? undefined : { type: 'toggle' };
    case 'left':
    case 'right':
      return seeksOnLeftRight(state)
        ? { type: 'seekBy', seconds: event.eventType === 'left' ? -SEEK_STEP : SEEK_STEP }
        : undefined;
    case 'pan': {
      const dx = event.body?.x ?? 0;
      const state = event.body?.state;
      if (state === 'Began') return { type: 'scrub', phase: 'start', dx: 0 };
      if (state === 'Changed') return { type: 'scrub', phase: 'move', dx };
      if (state === 'Ended') return { type: 'scrub', phase: 'end', dx };
      return undefined;
    }
    case 'up':
    case 'down':
    case 'swipeUp':
    case 'swipeDown':
    case 'swipeLeft':
    case 'swipeRight':
      return shown ? undefined : { type: 'show' };
    default:
      return undefined;
  }
}

/** Where a scrub lands: from where it started, by the travel, inside the video. */
export function scrubTarget(from: number, dx: number, duration: number): number {
  return Math.min(Math.max(from + dx * SCRUB_SECONDS_PER_POINT, 0), duration);
}
