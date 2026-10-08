// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/api';
import { playErrorMessage } from '@/playback';

import { loadErrorMessage, Message } from './Message';

describe('Message', () => {
  it.each([
    [new ApiError('network'), "Couldn't reach the server. Check your connection and try again."],
    [new ApiError('http', 500), 'The server ran into a problem. Try again in a moment.'],
    [new ApiError('http', 403), "Couldn't load this. Try again."],
    [new ApiError('parse'), "Couldn't load this. Try again."],
  ])('%p → %s', (error, text) => {
    expect(loadErrorMessage(error)).toBe(text);
  });

  // playback.ts writes these out (it stays import-free for check:home): the player must say the same.
  it.each([new ApiError('network'), new ApiError('http', 503)])('the player says the same for %p', (error) => {
    expect(playErrorMessage(error)).toBe(loadErrorMessage(error));
  });

  it('shows the text and retries on press', async () => {
    const retry = jest.fn();
    await render(<Message text="Couldn't load this." retry={retry} />);
    expect(screen.getByText("Couldn't load this.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('announces itself as an alert when asked (an error that appears in place)', async () => {
    await render(<Message alert text="Quick Connect is turned off on this server." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Quick Connect is turned off on this server.');
  });

  it('has no Retry without a handler', async () => {
    await render(<Message fill text="This item isn't available." />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
