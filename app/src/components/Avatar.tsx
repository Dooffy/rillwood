// SPDX-License-Identifier: GPL-3.0-or-later
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { radii, type, useColors } from '@/theme';

import { Text } from './Text';

/** "Anna Lee" → "AL", "anna" → "A". */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/**
 * Round avatar: `image` (cast photo) when given and loading, else initials on a grey circle, person icon without a
 * name.
 */
export function Avatar({ name, image, size = 60 }: { name?: string; image?: string; size?: number }) {
  const c = useColors();
  const [failed, setFailed] = useState<string>();
  const letters = name ? initials(name) : '';
  const showImage = image !== undefined && failed !== image;
  return (
    <View
      testID="avatar"
      style={[styles.circle, { width: size, height: size, backgroundColor: c.elevated2 }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {showImage ? (
        <Image
          testID="avatar-image"
          source={image}
          cachePolicy="memory-disk"
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(image)}
        />
      ) : letters ? (
        // Sized to the circle, not the text setting (the name is spoken by the avatar's button).
        <Text maxFontSizeMultiplier={1} style={{ fontWeight: type.button.fontWeight, fontSize: size * 0.4 }}>
          {letters}
        </Text>
      ) : (
        <SymbolView name={{ ios: 'person.fill', android: 'person' }} tintColor={c.textSecondary} size={size * 0.5} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
