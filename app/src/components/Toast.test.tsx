// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { TOAST_MS, ToastProvider, useToast } from './Toast';

function Trigger({ message }: { message: string }) {
  const show = useToast();
  return (
    <Pressable onPress={() => show(message)}>
      <Text>show {message}</Text>
    </Pressable>
  );
}

async function renderToast() {
  await render(
    <ToastProvider>
      <Trigger message="One" />
      <Trigger message="Two" />
    </ToastProvider>,
  );
}

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a message and hides it after the timeout', async () => {
    await renderToast();
    await fireEvent.press(screen.getByText('show One'));
    expect(screen.getByRole('alert')).toHaveTextContent('One');
    await act(() => jest.advanceTimersByTime(TOAST_MS));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('replaces the current message and restarts the timer', async () => {
    await renderToast();
    await fireEvent.press(screen.getByText('show One'));
    await act(() => jest.advanceTimersByTime(TOAST_MS - 100));
    await fireEvent.press(screen.getByText('show Two'));
    await act(() => jest.advanceTimersByTime(200));
    expect(screen.getByRole('alert')).toHaveTextContent('Two');
    await act(() => jest.advanceTimersByTime(TOAST_MS));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('throws outside the provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Trigger message="x" />)).rejects.toThrow('useToast must be used inside ToastProvider');
  });
});
