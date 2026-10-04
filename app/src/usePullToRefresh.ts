// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react';

/**
 * How long the spinner stays after the data answered. A fast server answers before the finger lifts; ending the
 * refresh mid-gesture drops the native inset and leaves the spinner drawn over the content (iOS).
 */
export const REFRESH_HOLD_MS = 500;

/**
 * Pull-to-refresh state for a RefreshControl: `onRefresh` calls `refresh` and shows the spinner until `loading` is
 * false again, plus REFRESH_HOLD_MS.
 */
export function usePullToRefresh(
  loading: boolean,
  refresh: () => void,
): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!refreshing || loading) return;
    const timer = setTimeout(() => setRefreshing(false), REFRESH_HOLD_MS);
    return () => clearTimeout(timer);
  }, [refreshing, loading]);
  return {
    refreshing,
    onRefresh: () => {
      setRefreshing(true);
      refresh();
    },
  };
}
