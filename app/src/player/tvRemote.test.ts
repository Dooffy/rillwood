// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { remoteAction, scrubTarget, SCRUB_SECONDS_PER_POINT } from './tvRemote';

const hidden = { shown: false, onScrubber: false };
const onScrubber = { shown: true, onScrubber: true };
const onButtons = { shown: true, onScrubber: false };

describe('remoteAction', () => {
  it('Play-Pause always toggles; a click toggles only with the controls down (up, the focused control takes it)', () => {
    expect(remoteAction({ eventType: 'playPause' }, onButtons)).toEqual({ type: 'toggle' });
    expect(remoteAction({ eventType: 'select' }, hidden)).toEqual({ type: 'toggle' });
    expect(remoteAction({ eventType: 'select' }, onScrubber)).toBeUndefined();
  });

  it('acts on the release, not the press', () => {
    expect(remoteAction({ eventType: 'playPause', eventKeyAction: 0 }, hidden)).toBeUndefined();
    expect(remoteAction({ eventType: 'playPause', eventKeyAction: 1 }, hidden)).toEqual({ type: 'toggle' });
    expect(remoteAction({ eventType: 'playPause', eventKeyAction: '0' }, hidden)).toBeUndefined();
  });

  it('Left / Right seek 10 s, except on the track buttons (focus moves there)', () => {
    expect(remoteAction({ eventType: 'left' }, hidden)).toEqual({ type: 'seekBy', seconds: -10 });
    expect(remoteAction({ eventType: 'right' }, onScrubber)).toEqual({ type: 'seekBy', seconds: 10 });
    expect(remoteAction({ eventType: 'right' }, onButtons)).toBeUndefined();
  });

  it('a swipe scrubs: start, move by the travel, end', () => {
    expect(remoteAction({ eventType: 'pan', body: { state: 'Began', x: 3 } }, hidden)).toEqual({
      type: 'scrub',
      phase: 'start',
      dx: 0,
    });
    expect(remoteAction({ eventType: 'pan', body: { state: 'Changed', x: 120 } }, onScrubber)).toEqual({
      type: 'scrub',
      phase: 'move',
      dx: 120,
    });
    expect(remoteAction({ eventType: 'pan', body: { state: 'Ended', x: -40 } }, onScrubber)).toEqual({
      type: 'scrub',
      phase: 'end',
      dx: -40,
    });
  });

  it('up / down / a swipe show the controls when they are down; nothing otherwise', () => {
    expect(remoteAction({ eventType: 'down' }, hidden)).toEqual({ type: 'show' });
    expect(remoteAction({ eventType: 'swipeUp' }, hidden)).toEqual({ type: 'show' });
    expect(remoteAction({ eventType: 'up' }, onScrubber)).toBeUndefined();
    expect(remoteAction({ eventType: 'focus' }, hidden)).toBeUndefined();
  });
});

describe('scrubTarget', () => {
  it('moves by the travel, never before the start or past the end', () => {
    expect(scrubTarget(100, 50, 600)).toBe(100 + 50 * SCRUB_SECONDS_PER_POINT);
    expect(scrubTarget(5, -1000, 600)).toBe(0);
    expect(scrubTarget(590, 1000, 600)).toBe(600);
  });
});
