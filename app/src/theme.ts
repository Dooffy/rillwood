// SPDX-License-Identifier: GPL-3.0-or-later
// Design tokens (CLAUDE.md §3). Screens use these, never raw values.
import { createContext, useContext } from 'react';

const dark = {
  background: '#000000',
  surface: '#1C1C1E',
  elevated: '#2C2C2E',
  elevated2: '#3A3A3C',
  separator: '#38383A',
  text: '#FFFFFF',
  textSecondary: '#98989F',
  iconInactive: '#8E8E93',
  accent: '#FFFFFF',
  onAccent: '#000000',
  danger: '#FF453A',
  success: '#30D158',
};

export type Colors = typeof dark;

const light: Colors = {
  background: '#FFFFFF',
  surface: '#F2F2F7',
  elevated: '#E5E5EA',
  elevated2: '#D1D1D6',
  separator: '#C6C6C8',
  text: '#000000',
  textSecondary: '#6C6C70',
  iconInactive: '#8E8E93',
  accent: '#000000',
  onAccent: '#FFFFFF',
  danger: '#FF3B30',
  success: '#34C759',
};

export const palettes = { dark, light } as const;

export type Scheme = keyof typeof palettes;

/** Appearance setting + system scheme → scheme. System scheme unknown → dark. */
export function resolveScheme(appearance: 'system' | Scheme, system: Scheme | null | undefined): Scheme {
  return appearance === 'system' ? (system ?? 'dark') : appearance;
}

// Resolved once in the root layout. Wrap a subtree in another provider to force a palette (player is always dark).
export const ColorsContext = createContext<Colors>(dark);

export function useColors(): Colors {
  return useContext(ColorsContext);
}

/** Active scheme, for per-scheme assets (`assets[useScheme()]`). */
export function useScheme(): Scheme {
  return useColors() === palettes.light ? 'light' : 'dark';
}

/** On artwork (posters, backdrops): the image is the background, so these stay the same in both themes. */
export const onArtwork = {
  fill: '#FFFFFF',
  track: 'rgba(255, 255, 255, 0.35)',
  /** Bottom fade under the progress bar so it reads on bright art (Apple TV style). */
  fade: 'linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.35) 45%, rgba(0, 0, 0, 0.75) 100%)',
} as const;

/** Dims the screen behind a sheet or menu, in both themes. */
export const backdrop = 'rgba(0, 0, 0, 0.5)';

export const radii = {
  card: 12,
  cardLarge: 20,
  pill: 999,
} as const;

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' },
  sectionHeader: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 17, fontWeight: '400' },
  button: { fontSize: 17, fontWeight: '600' },
  label: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;

export const minTouch = 44;

/** Opacity of a pressed button, card or row. */
export const pressedOpacity = 0.5;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
} as const;
