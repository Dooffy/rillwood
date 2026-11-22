// SPDX-License-Identifier: GPL-3.0-or-later
// Liquid Glass surface (iOS 26+, expo-glass-effect); a translucent fill elsewhere. Used over video (player controls).
// Apple: never put a glass view under opacity < 1 - hide it by unmounting, not fading.
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { View, type ViewProps } from 'react-native';
import type { ReactNode } from 'react';

import { glassFallback, type Scheme } from '@/theme';

const liquid = isLiquidGlassAvailable();

export function Glass({
  style,
  interactive = false,
  tint,
  fallback = glassFallback,
  colorScheme = 'dark',
  testID,
  children,
}: {
  style?: ViewProps['style'];
  /** Native press feedback (buttons). */
  interactive?: boolean;
  /** A colour over the glass (darker for text over a bright picture). */
  tint?: string;
  /** The fill without Liquid Glass. */
  fallback?: string;
  /** Dark over video; a menu over the app follows the palette (TV menus). */
  colorScheme?: Scheme;
  testID?: string;
  children?: ReactNode;
}) {
  if (!liquid)
    return (
      <View testID={testID} style={[{ backgroundColor: fallback }, style]}>
        {children}
      </View>
    );
  return (
    <GlassView
      testID={testID}
      glassEffectStyle="regular"
      colorScheme={colorScheme}
      isInteractive={interactive}
      tintColor={tint}
      style={style}
    >
      {children}
    </GlassView>
  );
}
