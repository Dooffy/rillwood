// SPDX-License-Identifier: GPL-3.0-or-later
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useColors, useScheme } from '@/theme';

// Pebble screen mark, one SVG per palette (pebble = text, play button = surface of that palette).
const marks = {
  dark: require('../../assets/images/logo-mark-dark.svg'),
  light: require('../../assets/images/logo-mark-light.svg'),
};

/** Rillwood mark: a river pebble with a play button, on a rounded surface tile. Decorative - pair it with the app name. */
export function LogoMark({ size = 72 }: { size?: number }) {
  const c = useColors();
  return (
    <View
      testID="logo-mark"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tile, { width: size, height: size, backgroundColor: c.surface, borderRadius: size / 4 }]}
    >
      <Image source={marks[useScheme()]} style={{ width: size, height: size }} contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { overflow: 'hidden' },
});
