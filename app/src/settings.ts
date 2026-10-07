// SPDX-License-Identifier: GPL-3.0-or-later
// User settings in kv-store (CLAUDE.md §2). Read once (sync) on first use, then served from memory.
import { Storage } from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Appearance as RNAppearance } from 'react-native';

export const APPEARANCE_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
] as const;

export type Appearance = (typeof APPEARANCE_OPTIONS)[number]['value'];

// Player subtitle size (mpv `sub-scale`), same for every account. Speed isn't remembered (1× on every open).
export const SUBTITLE_SIZES = [
  { value: 0.8, label: 'Small' },
  { value: 1, label: 'Medium' },
  { value: 1.25, label: 'Large' },
  { value: 1.5, label: 'Extra large' },
] as const;

export type SubtitleScale = (typeof SUBTITLE_SIZES)[number]['value'];

const APPEARANCE_KEY = 'settings.appearance';
const SUBTITLE_SCALE_KEY = 'settings.subtitleScale';

let appearance: Appearance | undefined;
let subtitleScale: SubtitleScale | undefined;
const listeners = new Set<() => void>();

export function getAppearance(): Appearance {
  if (appearance === undefined) {
    const stored = Storage.getItemSync(APPEARANCE_KEY);
    appearance = APPEARANCE_OPTIONS.find((o) => o.value === stored)?.value ?? 'system';
  }
  return appearance;
}

export function setAppearance(value: Appearance): void {
  Storage.setItemSync(APPEARANCE_KEY, value);
  appearance = value;
  applyNativeAppearance();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getAppearance);
}

export function getSubtitleScale(): SubtitleScale {
  if (subtitleScale === undefined) {
    const stored = Number(Storage.getItemSync(SUBTITLE_SCALE_KEY));
    subtitleScale = SUBTITLE_SIZES.find((o) => o.value === stored)?.value ?? 1;
  }
  return subtitleScale;
}

export function setSubtitleScale(value: SubtitleScale): void {
  Storage.setItemSync(SUBTITLE_SCALE_KEY, String(value));
  subtitleScale = value;
  listeners.forEach((l) => l());
}

export function useSubtitleScale(): SubtitleScale {
  return useSyncExternalStore(subscribe, getSubtitleScale);
}

/**
 * Native override (headers, tab bar, system UI). JS colours come from `useAppearance()` instead - RN's
 * `setColorScheme` emits no JS event, and on iOS only overrides windows that already exist, so the root layout calls
 * this on mount, not at import.
 */
export function applyNativeAppearance(): void {
  const value = getAppearance();
  RNAppearance.setColorScheme(value === 'system' ? 'auto' : value);
}
