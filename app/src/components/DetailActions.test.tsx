// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PHONE, resetDevice, setDevice, TABLET_PORTRAIT } from '@/testDevice';

import { DetailActions, WIDE_PLAY_MIN_WIDTH } from './DetailActions';

const off = { played: false, favourite: false, onMark: () => {} };

afterEach(resetDevice);

describe('DetailActions', () => {
  // Phones and tablets: Play from Start is a round button in the row, the progress lives in the play capsule.
  it('puts Play from Start in the row as a round button on every device', async () => {
    const props = { play: { progress: 0.4, remainingSeconds: 600 }, onPlay: () => {}, onStartOver: () => {}, ...off };
    for (const [width, height] of [PHONE, TABLET_PORTRAIT]) {
      await setDevice(width, height);
      await render(<DetailActions {...props} />);
      expect(screen.queryByText('Play from Start')).toBeNull();
      expect(screen.getByRole('button', { name: 'Play from Start' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Resume, 10 minutes left' })).toBeOnTheScreen();
    }
  });

  it('keeps the play capsule at least WIDE_PLAY_MIN_WIDTH wide on tablets, the rest of the row on phones', async () => {
    await setDevice(...TABLET_PORTRAIT);
    await render(<DetailActions play={{}} onPlay={() => {}} {...off} />);
    expect(screen.getByTestId('play-slot')).toHaveStyle({ minWidth: WIDE_PLAY_MIN_WIDTH });
    await setDevice(...PHONE);
    expect(screen.getByTestId('play-slot')).toHaveStyle({ flex: 1 });
  });

  it('plays and starts over', async () => {
    const onPlay = jest.fn();
    const onStartOver = jest.fn();
    const play = { label: 'S1, E2', spokenLabel: 'Season 1, Episode 2', progress: 0.5, remainingSeconds: 60 };
    await render(<DetailActions play={play} onPlay={onPlay} onStartOver={onStartOver} {...off} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Resume Season 1, Episode 2, 1 minute left' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Play from Start' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it('disables Play until there is something to play', async () => {
    await render(<DetailActions play={{}} {...off} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Play from Start' })).toBeNull();
  });

  it('toggles watched and favourite on: one name each, the state read from selected', async () => {
    const onMark = jest.fn();
    await render(<DetailActions play={{}} played={false} favourite={false} onMark={onMark} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Watched', selected: false }));
    await fireEvent.press(screen.getByRole('button', { name: 'Favourite', selected: false }));
    expect(onMark.mock.calls).toEqual([
      ['played', true],
      ['favourite', true],
    ]);
  });

  it('toggles them off when on (filled, read as selected)', async () => {
    const onMark = jest.fn();
    await render(<DetailActions play={{}} played favourite onMark={onMark} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Watched', selected: true }));
    await fireEvent.press(screen.getByRole('button', { name: 'Favourite', selected: true }));
    expect(onMark.mock.calls).toEqual([
      ['played', false],
      ['favourite', false],
    ]);
  });
});
