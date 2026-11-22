// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV shelf focus: the first swipe in lands on the first card, later ones on the card focused last (tvOS skips it
// once it's gone, so the first card comes next); rows with no `start` keep tvOS's own memory.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { act } from 'react';
import { Platform, Pressable } from 'react-native';

import { PosterCard } from '@/components/Card';
import { TvFocusRow } from '@/components/tv/focus';
import { TvShelf } from '@/components/tv/TvShelf';

// The guide's targets as they reach the native command: the instances themselves (no native tags under Jest).
jest.mock('react-native/Libraries/Components/TV/tagForComponentOrHandle', () => ({
  __esModule: true,
  default: (target: unknown) => target,
}));

type Target = { props: { accessibilityLabel?: string } };
const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
// The native view command, a stub under Jest (jest.setup.ts).
const commands = jest.requireMock<{ Commands: { setDestinations: (guide: unknown, targets: Target[]) => void } }>(
  'react-native/Libraries/Components/View/ViewNativeComponent',
).Commands;
let setDestinations: jest.SpiedFunction<typeof commands.setDestinations>;
beforeEach(() => {
  Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
  setDestinations = jest.spyOn(commands, 'setDestinations');
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'isTV', isTV);
});

/** The guide's targets now, by card title. */
const targets = () => setDestinations.mock.calls.at(-1)?.[1].map((t) => t.props.accessibilityLabel);

const shelf = (ids: string[]) => (
  <TvShelf title="Continue Watching">
    {ids.map((id) => (
      <PosterCard key={id} title={id} />
    ))}
  </TvShelf>
);

/** Focus lands on a card: the row hears it (capture phase) with the card as the target. */
async function focus(title: string) {
  const card = screen.getByLabelText(title);
  let row = card.parent;
  while (row && typeof row.props.onFocusCapture !== 'function') row = row.parent;
  await act(() => row!.props.onFocusCapture({ target: { props: { accessibilityLabel: title } } }));
}

describe('TvShelf focus', () => {
  it('first visit: the first card, not a pick of tvOS', async () => {
    await render(shelf(['a', 'b', 'c']));
    expect(targets()).toEqual(['a']);
  });

  it('later: the card focused last, then the first card (when that one is gone)', async () => {
    await render(shelf(['a', 'b', 'c']));
    await focus('c');
    expect(targets()).toEqual(['c', 'a']);
  });

  it('cards reordered (a refetch after playback): the new first card is the fallback', async () => {
    const view = await render(shelf(['a', 'b', 'c']));
    await focus('b');
    await view.rerender(shelf(['c', 'a']));
    expect(targets()).toEqual(['b', 'c']);
  });
});

describe('TvFocusRow', () => {
  it('no start: tvOS keeps its own memory (no targets set)', async () => {
    await render(
      <TvFocusRow>
        <Pressable accessibilityLabel="Play" />
      </TvFocusRow>,
    );
    expect(setDestinations).not.toHaveBeenCalled();
  });
});
