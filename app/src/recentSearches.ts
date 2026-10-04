// SPDX-License-Identifier: GPL-3.0-or-later
// Recent searches per account, newest first, in memory for the app session (not persisted yet).
import { useSyncExternalStore } from 'react';

export const RECENT_LIMIT = 8;

const recent = new Map<string, string[]>();
const listeners = new Set<() => void>();
const NONE: string[] = [];

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Puts `term` first (once, case-insensitive), keeping at most RECENT_LIMIT. */
export function addRecentSearch(accountId: string, term: string) {
  const clean = term.trim();
  if (!clean) return;
  const others = (recent.get(accountId) ?? []).filter((t) => t.toLowerCase() !== clean.toLowerCase());
  recent.set(accountId, [clean, ...others].slice(0, RECENT_LIMIT));
  emit();
}

export function clearRecentSearches(accountId: string) {
  recent.delete(accountId);
  emit();
}

export function useRecentSearches(accountId: string | undefined): string[] {
  return useSyncExternalStore(subscribe, () => (accountId ? (recent.get(accountId) ?? NONE) : NONE));
}
