// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/api';

import { loadErrorMessage, Message } from './Message';

describe('Message', () => {
  it.each([
    [new ApiError('network'), "Couldn't reach the server."],
    [new ApiError('http', 500), "Couldn't load this."],
    [new ApiError('parse'), "Couldn't load this."],
  ])('%p → %s', (error, text) => {
    expect(loadErrorMessage(error)).toBe(text);
  });

  it('shows the text and retries on press', async () => {
    const retry = jest.fn();
    await render(<Message text="Couldn't load this." retry={retry} />);
    expect(screen.getByText("Couldn't load this.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('has no Retry without a handler', async () => {
    await render(<Message fill text="This item isn't available." />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
