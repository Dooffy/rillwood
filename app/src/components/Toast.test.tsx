// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Pressable, Text } from 'react-native';

import { ACTION_TOAST_MS, SCREEN_READER_ACTION_TOAST_MS, TOAST_MS, ToastProvider, useToast } from './Toast';

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

  it('a button runs its action and closes the toast; it stays longer', async () => {
    const keep = jest.fn();
    function WithAction() {
      const show = useToast();
      return (
        <Pressable onPress={() => show('Watched - removed in 24 hours.', { label: 'Keep', onPress: keep })}>
          <Text>show action</Text>
        </Pressable>
      );
    }
    await render(
      <ToastProvider>
        <WithAction />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByText('show action'));
    await act(() => jest.advanceTimersByTime(TOAST_MS));
    expect(screen.getByRole('alert')).toHaveTextContent(/Watched - removed in 24 hours\./);
    await fireEvent.press(screen.getByRole('button', { name: 'Keep' }));
    expect(keep).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();

    await fireEvent.press(screen.getByText('show action'));
    await act(() => jest.advanceTimersByTime(ACTION_TOAST_MS));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('with a screen reader on, a toast with a button stays longer still', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    function WithAction() {
      const show = useToast();
      return (
        <Pressable onPress={() => show('Watched - removed in 24 hours.', { label: 'Keep', onPress: () => {} })}>
          <Text>show action</Text>
        </Pressable>
      );
    }
    await render(
      <ToastProvider>
        <WithAction />
      </ToastProvider>,
    );
    await act(async () => {});
    await fireEvent.press(screen.getByText('show action'));
    await act(() => jest.advanceTimersByTime(ACTION_TOAST_MS));
    expect(screen.getByRole('button', { name: 'Keep' })).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTime(SCREEN_READER_ACTION_TOAST_MS - ACTION_TOAST_MS));
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
  });

  it('throws outside the provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Trigger message="x" />)).rejects.toThrow('useToast must be used inside ToastProvider');
  });
});
