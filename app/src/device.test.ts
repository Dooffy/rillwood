// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it } from '@jest/globals';
import { Platform } from 'react-native';

import { features } from '@/device';
import { deviceSizes, tv } from '@/theme';

const isTV = Object.getOwnPropertyDescriptor(Platform, 'isTV')!;
const setTV = (on: boolean) => Object.defineProperty(Platform, 'isTV', { get: () => on, configurable: true });

afterEach(() => {
  Object.defineProperty(Platform, 'isTV', isTV);
});

describe('features', () => {
  it('phones and tablets have every feature', () => {
    setTV(false);
    expect({ ...features }).toEqual({ downloads: true, rotation: true, touch: true, lastingFiles: true });
  });

  it('Apple TV: no downloads, rotation, touch or lasting files - read on use, not at import', () => {
    setTV(true);
    expect([features.downloads, features.rotation, features.touch, features.lastingFiles]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('deviceSizes', () => {
  it('phones and tablets: the components keep their own sizes', () => {
    setTV(false);
    expect([deviceSizes.cardTitle, deviceSizes.cardSubtitle, deviceSizes.tvShelf, deviceSizes.artworkStatus]).toEqual([
      undefined,
      undefined,
      null,
      undefined,
    ]);
  });

  it('Apple TV: TV type under cards, TV shelf margin + card widths', () => {
    setTV(true);
    expect(deviceSizes.cardTitle).toBe(tv.type.cardTitle);
    expect(deviceSizes.cardSubtitle).toBe(tv.type.small);
    expect(deviceSizes.artworkStatus).toMatchObject({ barHeight: 8, text: { fontSize: tv.type.caption.fontSize } });
    expect(deviceSizes.tvShelf).toEqual({
      margin: tv.margin,
      poster: tv.shelf.posterWidth,
      landscape: tv.shelf.landscapeWidth,
      gap: tv.shelf.gap,
      focusRoom: tv.shelf.focusRoom,
    });
  });
});
