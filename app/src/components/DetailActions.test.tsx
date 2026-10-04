// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { DetailActions } from './DetailActions';
import { ToastProvider } from './Toast';

describe('DetailActions', () => {
  it('plays, starts over and shows the watched state', async () => {
    const onPlay = jest.fn();
    const onStartOver = jest.fn();
    await render(
      <ToastProvider>
        <DetailActions playTitle="Resume S1:E2" onPlay={onPlay} onStartOver={onStartOver} played />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Resume S1:E2' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Play from Start' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onStartOver).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Watched' })).toBeOnTheScreen();
  });

  it('disables Play until there is something to play', async () => {
    await render(
      <ToastProvider>
        <DetailActions playTitle="Play" />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Play from Start' })).toBeNull();
  });

  it('keeps watched and favourite as placeholders', async () => {
    await render(
      <ToastProvider>
        <DetailActions playTitle="Play" onPlay={() => {}} />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add to favourites' }));
    expect(await screen.findByText('Coming in a later build.')).toBeOnTheScreen();
  });
});
