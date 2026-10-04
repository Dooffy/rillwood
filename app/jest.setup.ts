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

// Liquid Glass is native-only: tests get the translucent fallback (`Glass`).
jest.mock('expo-glass-effect', () => ({
  GlassView: require('react-native').View,
  isLiquidGlassAvailable: () => false,
}));

// Reanimated + worklets run on the JS thread in tests.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// Reanimated 4.7 under the native Jest preset loads its native initializer, which needs the native module: use the
// JS one (no CSS event handler) - re-check on Reanimated bumps.
jest.mock('react-native-reanimated/src/initializers.native.ts', () =>
  jest.requireActual('react-native-reanimated/src/initializers.ts'),
);
// The mock's useSharedValue returns a new object every render; real shared values are stable.
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  const { useState } = require('react');
  return { ...mock, useSharedValue: <T>(init: T) => useState(() => mock.useSharedValue(init))[0] };
});

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
