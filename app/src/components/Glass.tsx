// SPDX-License-Identifier: GPL-3.0-or-later
// Liquid Glass surface (iOS 26+, expo-glass-effect); a translucent fill elsewhere. Used over video (player controls).
// Apple: never put a glass view under opacity < 1 - hide it by unmounting, not fading.
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { View, type ViewProps } from 'react-native';
import type { ReactNode } from 'react';

import { glassFallback } from '@/theme';

const liquid = isLiquidGlassAvailable();

export function Glass({
  style,
  interactive = false,
  tint,
  fallback = glassFallback,
  children,
}: {
  style?: ViewProps['style'];
  /** Native press feedback (buttons). */
  interactive?: boolean;
  /** A colour over the glass (darker for text over a bright picture). */
  tint?: string;
  /** The fill without Liquid Glass. */
  fallback?: string;
  children?: ReactNode;
}) {
  if (!liquid) return <View style={[{ backgroundColor: fallback }, style]}>{children}</View>;
  return (
    <GlassView glassEffectStyle="regular" colorScheme="dark" isInteractive={interactive} tintColor={tint} style={style}>
      {children}
    </GlassView>
  );
}
