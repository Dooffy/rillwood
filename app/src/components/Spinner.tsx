// SPDX-License-Identifier: GPL-3.0-or-later
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useColors } from '@/theme';

/** Centred loading indicator. `fill` takes the whole parent (full-screen loading state). */
export function Spinner({ fill = false }: { fill?: boolean }) {
  const c = useColors();
  return (
    <View testID="spinner" style={fill ? styles.fill : undefined}>
      <ActivityIndicator accessibilityLabel="Loading" color={c.text} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
