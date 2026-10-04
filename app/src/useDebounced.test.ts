// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { useDebounced } from './useDebounced';

afterEach(() => {
  jest.useRealTimers();
});

describe('useDebounced', () => {
  it('settles on the last value once it stops changing', async () => {
    jest.useFakeTimers();
    const { result, rerender } = await renderHook((v: string) => useDebounced(v, 300), { initialProps: 's' });
    expect(result.current).toBe('s');
    await rerender('si');
    await act(() => jest.advanceTimersByTime(200));
    await rerender('sin');
    await act(() => jest.advanceTimersByTime(200));
    expect(result.current).toBe('s');
    await act(() => jest.advanceTimersByTime(100));
    expect(result.current).toBe('sin');
  });
});
