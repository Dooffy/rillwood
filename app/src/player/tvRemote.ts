// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV remote in the player (screen draft 10), as pure logic: what an event from the remote does, given whether
// the controls are up and where focus is. Click / Play-Pause = play or pause; Left / Right click = -10 / +10 s (unless
// focus is on the track buttons, where they move focus); a swipe on the touch surface scrubs; anything else shows the
// controls. Menu (Back) is handled by the screen: hide the controls, then close.
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
  | { type: 'scrub'; phase: 'start' | 'move' | 'end'; dx: number };

/** Seconds a swipe moves per point of travel on the touch surface: a full swipe is a few minutes. */
export const SCRUB_SECONDS_PER_POINT = 0.2;
/** Less travel than this is a touch, not a scrub. */
export const SCRUB_MIN_POINTS = 20;

export function remoteAction(event: RemoteEvent, { shown, onScrubber }: RemoteState): RemoteAction | undefined {
  if (event.eventKeyAction !== undefined && Number(event.eventKeyAction) === 0) return undefined;
  switch (event.eventType) {
    case 'playPause':
      return { type: 'toggle' };
    case 'select':
      // Controls up: the focused control takes the click (the scrubber plays / pauses, a button opens its menu).
      return shown ? undefined : { type: 'toggle' };
    case 'left':
    case 'right':
      return !shown || onScrubber
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
