// SPDX-License-Identifier: GPL-3.0-or-later
// Tests only: the device a test lays out for. Jest's default window (750 x 1334) counts as a tablet, so tests that
// size or arrange things for phones vs tablets say which device. Restore the default after each test.
import { act } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

const defaultWindow = Dimensions.get('window');
const defaultScreen = Dimensions.get('screen');

/** Window and screen this size (points), as a device of it would report them; re-renders listeners. */
export function setDevice(width: number, height: number) {
  return act(() =>
    Dimensions.set({ window: { ...defaultWindow, width, height }, screen: { ...defaultScreen, width, height } }),
  );
}

/** Back to Jest's default size (`afterEach`). */
export function resetDevice() {
  Dimensions.set({ window: defaultWindow, screen: defaultScreen });
}

/** Common sizes: an iPhone and an iPad, both ways up. */
export const PHONE = [390, 844] as const;
export const TABLET_PORTRAIT = [834, 1194] as const;
export const TABLET_LANDSCAPE = [1194, 834] as const;
