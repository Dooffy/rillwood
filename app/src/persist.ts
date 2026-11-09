// SPDX-License-Identifier: GPL-3.0-or-later
// Small values that must outlive the app (accounts list, settings), sync like the kv-store. Phones + tablets: the
// kv-store. Apple TV: the Keychain (`expo-secure-store`) - tvOS keeps the kv-store's SQLite file in Caches, which the
// system may purge when space is low (docs/research/apple-tv.md). The device check lives here, not in the callers.
import { Storage } from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Keys: [A-Za-z0-9._-] (secure-store's rule; the kv-store takes any string).

/** The stored value, or null. On TV an unreadable Keychain item reads as unset (the default). */
export function getPersisted(key: string): string | null {
  if (!Platform.isTV) return Storage.getItemSync(key);
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

export function setPersisted(key: string, value: string): void {
  if (Platform.isTV) SecureStore.setItem(key, value);
  else Storage.setItemSync(key, value);
}
