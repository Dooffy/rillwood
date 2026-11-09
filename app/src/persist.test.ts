// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Storage } from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

import { getPersisted, setPersisted } from './persist';

const secure = jest.requireMock<{ __store: Map<string, string> }>('expo-secure-store').__store;
const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;

beforeEach(() => {
  Storage.clearSync();
  secure.clear();
});

describe('phone', () => {
  it('reads and writes the kv-store, never the Keychain', () => {
    setPersisted('settings.appearance', 'dark');
    expect(Storage.getItemSync('settings.appearance')).toBe('dark');
    expect(secure.size).toBe(0);
    expect(getPersisted('settings.appearance')).toBe('dark');
    expect(getPersisted('settings.videoZoom')).toBeNull();
  });
});

describe('Apple TV', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'isTV', { get: () => true, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(Platform, 'isTV', isTV);
  });

  it('reads and writes the Keychain, never the kv-store (tvOS keeps it in purgeable Caches)', () => {
    setPersisted('settings.appearance', 'dark');
    expect(secure.get('settings.appearance')).toBe('dark');
    expect(Storage.getItemSync('settings.appearance')).toBeNull();
    expect(getPersisted('settings.appearance')).toBe('dark');
  });

  it('ignores kv-store values', () => {
    Storage.setItemSync('settings.appearance', 'light');
    expect(getPersisted('settings.appearance')).toBeNull();
  });

  it('reads an unreadable Keychain item as unset', () => {
    const mod = jest.requireMock<{ getItem: (key: string) => string | null }>('expo-secure-store');
    const read = mod.getItem;
    mod.getItem = () => {
      throw new Error('keychain error');
    };
    try {
      expect(getPersisted('settings.appearance')).toBeNull();
    } finally {
      mod.getItem = read;
    }
  });
});
