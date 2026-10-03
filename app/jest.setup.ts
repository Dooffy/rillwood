// SPDX-License-Identifier: GPL-3.0-or-later
// Shared native-module mocks for every test file (package.json "jest.setupFiles").
import { jest } from '@jest/globals';

// In-memory kv-store; tests seed / read it through the real sync API and `clearSync()` it in beforeEach.
jest.mock('expo-sqlite/kv-store', () => {
  const store = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => store.get(key) ?? null,
      setItemSync: (key: string, value: string) => void store.set(key, value),
      clearSync: () => {
        store.clear();
        return true;
      },
    },
  };
});

// In-memory secure-store; tests read / clear it through `__store`.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    getItemAsync: async (key: string) => store.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void store.set(key, value),
    deleteItemAsync: async (key: string) => void store.delete(key),
  };
});

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
