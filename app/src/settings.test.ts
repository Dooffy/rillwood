// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';
import { Appearance as RNAppearance } from 'react-native';

import { setAppearance, useAppearance } from './settings';

type Settings = typeof import('./settings');

// Fresh module for read tests: the setting is cached in memory after the first read.
function load(): Settings {
  let mod: Settings | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a sync require
    mod = require('./settings');
  });
  return mod!;
}

describe('appearance setting', () => {
  let setColorScheme: jest.SpiedFunction<typeof RNAppearance.setColorScheme>;

  beforeEach(() => {
    Storage.clearSync();
    setColorScheme = jest.spyOn(RNAppearance, 'setColorScheme').mockImplementation(() => {});
  });

  it('defaults to system', () => {
    expect(load().getAppearance()).toBe('system');
  });

  it('reads the stored value', () => {
    Storage.setItemSync('settings.appearance', 'dark');
    expect(load().getAppearance()).toBe('dark');
  });

  it('falls back to system for unknown stored values', () => {
    Storage.setItemSync('settings.appearance', 'sepia');
    expect(load().getAppearance()).toBe('system');
  });

  it('persists and applies the native override', () => {
    const { getAppearance, setAppearance } = load();
    setAppearance('light');
    expect(getAppearance()).toBe('light');
    expect(Storage.getItemSync('settings.appearance')).toBe('light');
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
  });

  it('maps system to auto (follow the OS)', () => {
    load().setAppearance('system');
    expect(setColorScheme).toHaveBeenLastCalledWith('auto');
  });

  it('applies the stored value natively', () => {
    Storage.setItemSync('settings.appearance', 'dark');
    load().applyNativeAppearance();
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
  });

  // Shared module instance here: an isolated copy would bring its own React.
  it('re-renders useAppearance subscribers on change', async () => {
    setAppearance('system');
    const { result } = await renderHook(() => useAppearance());
    expect(result.current).toBe('system');
    await act(() => setAppearance('dark'));
    expect(result.current).toBe('dark');
  });
});
