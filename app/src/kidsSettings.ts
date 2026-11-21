// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode state per account (docs/context/kids.md): the kids account mark and the shared phone mode + filter. One
// persisted key for every account (`src/persist.ts`), read once on first use, then served from memory.
import { useSyncExternalStore } from 'react';

import { AGE_STEPS, type AgeStep, type KidsFilter } from '@/kids';
import { getPersisted, setPersisted } from '@/persist';

const KEY = 'settings.kids';

export type KidsSettings = {
  /** Kids account: opens in kids mode whenever it's the active account, the server filters. */
  account: boolean;
  /** Shared phone: kids mode on this account until a grown-up leaves. */
  shared: boolean;
  /** Shared filter - kept while kids mode is off, so the last pick comes back. */
  age: AgeStep;
  /** Unrated videos shown (hidden by default). */
  unrated: boolean;
  /** Library ids shown; undefined = all. */
  libraries?: string[];
};

export type KidsMode = 'off' | 'account' | 'shared';

export const DEFAULT_KIDS: KidsSettings = { account: false, shared: false, age: 7, unrated: false };

let byAccount: Record<string, KidsSettings> | undefined;
const listeners = new Set<() => void>();

/** A stored entry, fixed up field by field: anything unreadable falls back to the default. */
function clean(value: unknown): KidsSettings {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof KidsSettings, unknown>>;
  const libraries = Array.isArray(v.libraries) ? v.libraries.filter((id) => typeof id === 'string') : undefined;
  return {
    account: v.account === true,
    shared: v.shared === true,
    age: AGE_STEPS.find((step) => step === v.age) ?? DEFAULT_KIDS.age,
    unrated: v.unrated === true,
    ...(libraries && { libraries }),
  };
}

function load(): Record<string, KidsSettings> {
  if (byAccount === undefined) {
    byAccount = {};
    try {
      const stored: unknown = JSON.parse(getPersisted(KEY) ?? '{}');
      if (typeof stored === 'object' && stored !== null) {
        for (const [id, value] of Object.entries(stored)) byAccount[id] = clean(value);
      }
    } catch {
      // Unreadable: every account starts from the default.
    }
  }
  return byAccount;
}

function save(next: Record<string, KidsSettings>) {
  setPersisted(KEY, JSON.stringify(next));
  byAccount = next;
  listeners.forEach((l) => l());
}

/** The account's kids settings; the same object until it changes (safe for `useSyncExternalStore`). */
export function getKids(accountId: string | undefined): KidsSettings {
  return (accountId !== undefined && load()[accountId]) || DEFAULT_KIDS;
}

export function setKids(accountId: string, change: Partial<KidsSettings>): void {
  save({ ...load(), [accountId]: clean({ ...getKids(accountId), ...change }) });
}

/** Removing an account drops its kids settings (`removeAccount`). */
export function forgetKids(accountId: string): void {
  const all = load();
  if (!(accountId in all)) return;
  const { [accountId]: _removed, ...rest } = all;
  save(rest);
}

/** A kids account wins: the server filters it, so the shared filter never applies on top. */
export function kidsMode(settings: KidsSettings): KidsMode {
  return settings.account ? 'account' : settings.shared ? 'shared' : 'off';
}

/** The filter the app applies - shared phone only. The library pick is one library (stored as a list), or all. */
export function kidsFilter(settings: KidsSettings): KidsFilter | undefined {
  if (kidsMode(settings) !== 'shared') return undefined;
  const library = settings.libraries?.[0];
  return { age: settings.age, unrated: settings.unrated, ...(library && { library }) };
}

export function subscribeKids(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useKids(accountId: string | undefined): KidsSettings {
  return useSyncExternalStore(subscribeKids, () => getKids(accountId));
}
