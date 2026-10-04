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

// RN's Modal mock never calls onDismiss; iOS calls it once a hidden modal has finished closing. Mirror that so code
// that waits for it (ActionSheet) runs in tests.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Mock = jest.requireActual<{ default: React.ComponentType<{ visible?: boolean; onDismiss?: () => void }> }>(
    '@react-native/jest-preset/jest/mocks/Modal',
  ).default;
  function Modal(props: { visible?: boolean; onDismiss?: () => void }) {
    const wasVisible = React.useRef(props.visible !== false);
    const { visible, onDismiss } = props;
    React.useEffect(() => {
      if (wasVisible.current && visible === false) onDismiss?.();
      wasVisible.current = visible !== false;
    }, [visible, onDismiss]);
    return React.createElement(Mock, props);
  }
  return { __esModule: true, default: Modal };
});
