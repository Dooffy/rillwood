// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from 'react';

/** `value`, once it has stopped changing for `ms` (search while typing without a request per key). */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
