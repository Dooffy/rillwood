// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV remote in the player (screen draft 10): turns remote events into player actions (`remoteAction`), turns
// on swipe events for scrubbing while the player is open, and takes Menu (Back) while the controls are up - it hides
// them first; with them down, Back closes the player as usual. Off TV (`features.remote`) it does nothing.
import { useEffect, useRef } from 'react';
import { TVEventControl, useTVEventHandler } from 'react-native';

import { holdBack, useBackScope } from '@/components/tv/focus';
import { features } from '@/device';

import { remoteAction, SCRUB_MIN_POINTS, type RemoteEvent } from './tvRemote';

export type TvRemoteHandlers = {
  /** The controls are on screen. */
  shown: boolean;
  /** Focus is on the scrubber. */
  onScrubber: boolean;
  toggle: () => void;
  seekBy: (seconds: number) => void;
  show: () => void;
  hide: () => void;
  /** A swipe: begins, moves by `dx` points from where it began, ends (`dx` 0 = too short, a touch). */
  scrub: (phase: 'start' | 'move' | 'end', dx: number) => void;
};

export function useTvRemote(handlers: TvRemoteHandlers) {
  const on = features.remote;
  // The latest handlers: the remote's listener stays one per screen.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useTVEventHandler((event: RemoteEvent) => {
    if (!on) return;
    const h = latest.current;
    const action = remoteAction(event, { shown: h.shown, onScrubber: h.onScrubber });
    if (!action) return;
    if (action.type === 'toggle') return h.toggle();
    if (action.type === 'seekBy') return h.seekBy(action.seconds);
    if (action.type === 'show') return h.show();
    h.scrub(action.phase, action.phase === 'end' && Math.abs(action.dx) < SCRUB_MIN_POINTS ? 0 : action.dx);
  });

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
