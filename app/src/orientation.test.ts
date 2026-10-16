// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { OrientationLock } from 'expo-screen-orientation';

import { isTabletScreen } from '@/theme';

import { appOrientationLock } from './orientation';

describe('isTabletScreen', () => {
  it('goes by the short side, in either orientation', () => {
    expect(isTabletScreen({ width: 440, height: 956 })).toBe(false);
    expect(isTabletScreen({ width: 956, height: 440 })).toBe(false);
    expect(isTabletScreen({ width: 744, height: 1133 })).toBe(true);
    expect(isTabletScreen({ width: 1194, height: 834 })).toBe(true);
  });
});

describe('appOrientationLock', () => {
  it('keeps phones upright and lets tablets rotate', () => {
    expect(appOrientationLock({ width: 390, height: 844 })).toBe(OrientationLock.PORTRAIT_UP);
    expect(appOrientationLock({ width: 834, height: 1194 })).toBe(OrientationLock.DEFAULT);
  });
});
