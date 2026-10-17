// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PHONE, resetDevice, setDevice, TABLET_PORTRAIT } from '@/testDevice';

import { DetailActions } from './DetailActions';

const off = { played: false, favourite: false, onMark: () => {} };

afterEach(resetDevice);

describe('DetailActions', () => {
  // Phones: a full-width "Play from Start" capsule under the row. Tablets: a round button in the row (no text).
  it('puts Play from Start in the row on tablets, under it on phones', async () => {
    const props = { playTitle: 'Resume', onPlay: () => {}, onStartOver: () => {}, ...off };
    await setDevice(...PHONE);
    const { rerender } = await render(<DetailActions {...props} />);
    expect(screen.getByText('Play from Start')).toBeOnTheScreen();
    await setDevice(...TABLET_PORTRAIT);
    await rerender(<DetailActions {...props} />);
    expect(screen.queryByText('Play from Start')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play from Start' })).toBeOnTheScreen();
  });

  it('plays and starts over', async () => {
    const onPlay = jest.fn();
    const onStartOver = jest.fn();
    await render(<DetailActions playTitle="Resume S1:E2" onPlay={onPlay} onStartOver={onStartOver} {...off} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Resume S1:E2' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Play from Start' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it('disables Play until there is something to play', async () => {
    await render(<DetailActions playTitle="Play" {...off} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Play from Start' })).toBeNull();
  });

  it('toggles watched and favourite on: the label says what a tap does', async () => {
    const onMark = jest.fn();
    await render(<DetailActions playTitle="Play" played={false} favourite={false} onMark={onMark} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Mark as watched', selected: false }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to favourites', selected: false }));
    expect(onMark.mock.calls).toEqual([
      ['played', true],
      ['favourite', true],
    ]);
  });

  it('toggles them off when on (filled, read as selected)', async () => {
    const onMark = jest.fn();
    await render(<DetailActions playTitle="Play" played favourite onMark={onMark} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Mark as unwatched', selected: true }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from favourites', selected: true }));
    expect(onMark.mock.calls).toEqual([
      ['played', false],
      ['favourite', false],
    ]);
  });
});
