// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';

import { DEFAULT_KIDS, forgetKids, getKids, kidsFilter, kidsMode, setKids, useKids } from './kidsSettings';

type Module = typeof import('./kidsSettings');

// Fresh module: what a relaunch reads back from storage (the settings are cached in memory after the first read).
function relaunch(): Module {
  let mod: Module | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a sync require
    mod = require('./kidsSettings');
  });
  return mod!;
}

const stored = () => JSON.parse(Storage.getItemSync('settings.kids')!) as unknown;

beforeEach(() => {
  ['a', 'b'].forEach(forgetKids);
  Storage.clearSync();
});

describe('kids settings', () => {
  it('defaults to off, 7+, unrated hidden, every library', () => {
    expect(getKids('a')).toEqual({ account: false, shared: false, age: 7, unrated: false });
    expect(getKids(undefined)).toBe(DEFAULT_KIDS);
  });

  it('keeps each account apart', () => {
    setKids('a', { shared: true, age: 3 });
    expect(getKids('a')).toMatchObject({ shared: true, age: 3 });
    expect(getKids('b')).toBe(DEFAULT_KIDS);
  });

  it('survives a relaunch', () => {
    setKids('a', { shared: true, age: 10, unrated: true, libraries: ['lib1'] });
    setKids('b', { account: true });
    const mod = relaunch();
    expect(mod.getKids('a')).toEqual({ account: false, shared: true, age: 10, unrated: true, libraries: ['lib1'] });
    expect(mod.getKids('b')).toMatchObject({ account: true });
  });

  it('merges a change into what is there', () => {
    setKids('a', { shared: true, age: 13 });
    setKids('a', { shared: false });
    // the age stays for next time
    expect(getKids('a')).toMatchObject({ shared: false, age: 13 });
  });

  it('clears the library pick back to every library', () => {
    setKids('a', { libraries: ['lib1'] });
    setKids('a', { libraries: undefined });
    expect(getKids('a').libraries).toBeUndefined();
    expect(stored()).toEqual({ a: DEFAULT_KIDS });
  });

  it('reads damaged values as the default', () => {
    Storage.setItemSync(
      'settings.kids',
      JSON.stringify({ a: { account: 'yes', shared: true, age: 5, unrated: 1, libraries: ['lib1', 2] }, b: null }),
    );
    const mod = relaunch();
    expect(mod.getKids('a')).toEqual({ account: false, shared: true, age: 7, unrated: false, libraries: ['lib1'] });
    expect(mod.getKids('b')).toEqual(DEFAULT_KIDS);
  });

  it('reads unreadable storage as no settings', () => {
    Storage.setItemSync('settings.kids', 'not json');
    expect(relaunch().getKids('a')).toEqual(DEFAULT_KIDS);
    Storage.setItemSync('settings.kids', '[1]');
    expect(relaunch().getKids('0')).toEqual(DEFAULT_KIDS);
    Storage.setItemSync('settings.kids', 'null');
    expect(relaunch().getKids('a')).toEqual(DEFAULT_KIDS);
  });

  it('forgets an account', () => {
    setKids('a', { account: true });
    setKids('b', { shared: true });
    forgetKids('a');
    expect(getKids('a')).toBe(DEFAULT_KIDS);
    expect(stored()).toEqual({ b: { ...DEFAULT_KIDS, shared: true } });
    expect(relaunch().getKids('a')).toEqual(DEFAULT_KIDS);
  });

  it('re-renders on a change and returns the same object until then', async () => {
    const { result } = await renderHook(() => useKids('a'));
    expect(result.current).toBe(getKids('a'));
    await act(() => setKids('a', { shared: true }));
    const after = result.current;
    expect(after.shared).toBe(true);
    await act(() => setKids('b', { shared: true }));
    expect(result.current).toBe(after);
  });
});

describe('kidsMode / kidsFilter', () => {
  it('is off by default - no filter', () => {
    expect(kidsMode(DEFAULT_KIDS)).toBe('off');
    expect(kidsFilter(DEFAULT_KIDS)).toBeUndefined();
  });

  it('filters a shared phone by its age and unrated pick', () => {
    const s = { ...DEFAULT_KIDS, shared: true, age: 10 as const, unrated: true };
    expect(kidsMode(s)).toBe('shared');
    expect(kidsFilter(s)).toEqual({ age: 10, unrated: true });
  });

  it('lets a kids account win - the server filters, the app adds nothing', () => {
    const s = { ...DEFAULT_KIDS, account: true, shared: true };
    expect(kidsMode(s)).toBe('account');
    expect(kidsFilter(s)).toBeUndefined();
  });
});
