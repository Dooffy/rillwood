// SPDX-License-Identifier: GPL-3.0-or-later
// Rotation: phones stay upright portrait (only the player rotates), tablets rotate everywhere.
import * as ScreenOrientation from 'expo-screen-orientation';
import { Dimensions } from 'react-native';

import { isTabletScreen } from '@/theme';

/** The lock outside the player: free on tablets, upright portrait on phones. */
export function appOrientationLock(
  screen: { width: number; height: number } = Dimensions.get('screen'),
): ScreenOrientation.OrientationLock {
  return isTabletScreen(screen)
    ? ScreenOrientation.OrientationLock.DEFAULT
    : ScreenOrientation.OrientationLock.PORTRAIT_UP;
}

/** Back to the app's lock (launch, leaving the player). */
export function lockAppOrientation() {
  ScreenOrientation.lockAsync(appOrientationLock()).catch(() => {});
}
