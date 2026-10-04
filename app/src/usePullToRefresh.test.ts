// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { REFRESH_HOLD_MS, usePullToRefresh } from './usePullToRefresh';

afterEach(() => {
  jest.useRealTimers();
});

describe('usePullToRefresh', () => {
  it('refreshes and keeps the spinner until loading ends, plus the hold', async () => {
    jest.useFakeTimers();
    const refresh = jest.fn();
    const { result, rerender } = await renderHook((loading: boolean) => usePullToRefresh(loading, refresh), {
      initialProps: false,
    });
    await act(() => result.current.onRefresh());
    expect(refresh).toHaveBeenCalledTimes(1);
    await rerender(true);
    expect(result.current.refreshing).toBe(true);
    await rerender(false);
    expect(result.current.refreshing).toBe(true);
    await act(() => jest.advanceTimersByTime(REFRESH_HOLD_MS));
    expect(result.current.refreshing).toBe(false);
  });
});
