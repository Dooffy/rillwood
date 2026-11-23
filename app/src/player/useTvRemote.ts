// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV remote in the player (screen draft 10): turns remote events into player actions (`remoteAction`), turns
// on swipe events for scrubbing while the player is open, and takes Menu (Back) while the controls are up - it hides
// them first; with them down, Back closes the player as usual. Left / Right held repeat their seek every
// HOLD_REPEAT_MS, the step growing with the hold (`holdStep`), until let go, another remote action, the app left, the
// screen gone or the seek refused; the screen previews each step and seeks once, at its end. Off TV (`features.remote`) it does
// nothing.
import { useEffect, useRef } from 'react';
import { AppState, TVEventControl, useTVEventHandler } from 'react-native';

import { holdBack, useBackScope } from '@/components/tv/focus';
import { features } from '@/device';

import {
  HOLD_CLICK_GRACE_MS,
  HOLD_REPEAT_MS,
  holdStep,
  remoteAction,
  SCRUB_MIN_POINTS,
  seeksOnLeftRight,
  type RemoteEvent,
} from './tvRemote';

export type TvRemoteHandlers = {
  /** The controls are on screen. */
  shown: boolean;
  /** Focus is on the scrubber. */
  onScrubber: boolean;
  toggle: () => void;
  /**
   * Seek by `seconds` (`held`: a hold's step - the screen moves its preview, no seek yet). False = not now (a menu, Up
   * Next): a hold stops.
   */
  seekBy: (seconds: number, held?: boolean) => boolean;
  /** A hold that moved ended: seek to where it got. */
  held: () => void;
  show: () => void;
  hide: () => void;
  /** A swipe: begins, moves by `dx` points from where it began, ends (`dx` 0 = too short, a touch). */
  scrub: (phase: 'start' | 'move' | 'end', dx: number) => void;
};

type Hold = { direction: -1 | 1; started: number; seeked: boolean; timer?: ReturnType<typeof setInterval> };

export function useTvRemote(handlers: TvRemoteHandlers) {
  const on = features.remote;
  // The latest handlers: the remote's listener stays one per screen.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  const hold = useRef<Hold | undefined>(undefined);
  const holdEnded = useRef(-Infinity);
  const stopHold = () => {
    const h = hold.current;
    if (!h) return;
    clearInterval(h.timer);
    hold.current = undefined;
    holdEnded.current = Date.now();
    if (h.seeked) latest.current.held();
  };
  const repeat = () => {
    const h = hold.current;
    if (!h) return;
    const step = h.direction * holdStep(Date.now() - h.started);
    if (!seeksOnLeftRight(latest.current) || !latest.current.seekBy(step, true)) return stopHold();
    h.seeked = true;
  };
  const startHold = (direction: -1 | 1) => {
    stopHold();
    const h: Hold = { direction, started: Date.now(), seeked: false };
    hold.current = h;
    repeat();
    if (hold.current === h) h.timer = setInterval(repeat, HOLD_REPEAT_MS);
  };

  useTVEventHandler((event: RemoteEvent) => {
    if (!on) return;
    const h = latest.current;
    const action = remoteAction(event, { shown: h.shown, onScrubber: h.onScrubber });
    if (!action) return;
    if (action.type === 'holdStart') return startHold(action.direction);
    if (action.type === 'holdEnd') return stopHold();
    // A click during a hold, or its release just after: the hold seeks, not the click.
    if (action.type === 'seekBy') {
      if (hold.current || Date.now() - holdEnded.current < HOLD_CLICK_GRACE_MS) return;
      h.seekBy(action.seconds);
      return;
    }
    stopHold();
    if (action.type === 'toggle') return h.toggle();
    if (action.type === 'show') return h.show();
    h.scrub(action.phase, action.phase === 'end' && Math.abs(action.dx) < SCRUB_MIN_POINTS ? 0 : action.dx);
  });

  // The app left (a hold's end never comes) or the screen gone: the hold stops.
  useEffect(() => {
    if (!on) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopHold();
    });
    return () => {
      sub.remove();
      clearInterval(hold.current?.timer);
      hold.current = undefined;
    };
  }, [on]);

  // Swipes on the touch surface come as pan events only while asked for.
  useEffect(() => {
    if (!on) return;
    TVEventControl.enableTVPanGesture();
    return () => TVEventControl.disableTVPanGesture();
  }, [on]);

  const scope = useBackScope();
  // Controls up: Back hides them (the next Back closes).
  const { shown } = handlers;
  useEffect(() => {
    if (!on || !shown) return;
    return holdBack(() => latest.current.hide(), scope);
  }, [on, shown, scope]);
}
