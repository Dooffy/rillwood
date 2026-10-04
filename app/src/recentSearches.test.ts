// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { addRecentSearch, clearRecentSearches, RECENT_LIMIT, useRecentSearches } from './recentSearches';

describe('recent searches', () => {
  it('keeps the newest first, once each, per account, up to the limit', async () => {
    const { result } = await renderHook(() => useRecentSearches('acc-a'));
    await act(() => {
      addRecentSearch('acc-a', 'sintel');
      addRecentSearch('acc-a', ' test ');
      addRecentSearch('acc-a', 'Sintel');
      addRecentSearch('acc-b', 'other');
    });
    expect(result.current).toEqual(['Sintel', 'test']);
    await act(() => {
      for (let i = 0; i < RECENT_LIMIT + 2; i++) addRecentSearch('acc-a', `term ${i}`);
    });
    expect(result.current).toHaveLength(RECENT_LIMIT);
    expect(result.current[0]).toBe(`term ${RECENT_LIMIT + 1}`);
    await act(() => clearRecentSearches('acc-a'));
    expect(result.current).toEqual([]);
  });

  it('ignores blank terms and has nothing without an account', async () => {
    const { result } = await renderHook(() => useRecentSearches(undefined));
    await act(() => addRecentSearch('acc-c', '   '));
    expect(result.current).toEqual([]);
  });
});
