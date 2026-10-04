// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { DetailActions } from './DetailActions';

const off = { played: false, favourite: false, onMark: () => {} };

describe('DetailActions', () => {
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
