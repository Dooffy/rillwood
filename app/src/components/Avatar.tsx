// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
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

/** Round user avatar: initials on a grey circle, person icon without a name. Server profile images come with api.ts. */
export function Avatar({ name, size = 60 }: { name?: string; size?: number }) {
  const c = useColors();
  const letters = name ? initials(name) : '';
  return (
    <View
      testID="avatar"
      style={[styles.circle, { width: size, height: size, backgroundColor: c.elevated2 }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {letters ? (
        <Text style={{ fontWeight: type.button.fontWeight, fontSize: size * 0.4 }}>{letters}</Text>
      ) : (
        <SymbolView name={{ ios: 'person.fill', android: 'person' }} tintColor={c.textSecondary} size={size * 0.5} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
