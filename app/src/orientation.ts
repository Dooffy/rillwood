// SPDX-License-Identifier: GPL-3.0-or-later
// Rotation: phones stay upright portrait (only the player rotates), tablets rotate everywhere. Apple TV has no
// rotation and tvOS doesn't build expo-screen-orientation (importing it there throws), so it's never loaded on TV.
import type * as ScreenOrientationModule from 'expo-screen-orientation';
import { Dimensions, Platform } from 'react-native';

import { isTabletScreen } from '@/theme';

const ScreenOrientation: typeof ScreenOrientationModule | null = Platform.isTV
  ? null
  : // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only off TV (see top)
    require('expo-screen-orientation');

type Lock = 'DEFAULT' | 'PORTRAIT_UP';

/** The lock outside the player: free on tablets, upright portrait on phones. */
export function appOrientationLock(screen: { width: number; height: number } = Dimensions.get('screen')): Lock {
  return isTabletScreen(screen) ? 'DEFAULT' : 'PORTRAIT_UP';
}

function lock(to: Lock) {
  ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock[to]).catch(() => {});
}

/** Back to the app's lock (launch, leaving the player). */
export function lockAppOrientation() {
  lock(appOrientationLock());
}

/** The player rotates freely while open (the only screen that does on a phone). */
export function unlockOrientation() {
  lock('DEFAULT');
}
