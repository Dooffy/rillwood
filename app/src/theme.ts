// SPDX-License-Identifier: GPL-3.0-or-later
// Design tokens (CLAUDE.md §3). Screens use these, never raw values.

export const colors = {
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
} as const;

export const radii = {
  card: 12,
  button: 12,
  pill: 999,
} as const;

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' },
  sectionHeader: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 17, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;

export const minTouch = 44;
