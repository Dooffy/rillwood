// SPDX-License-Identifier: GPL-3.0-or-later
// Kids Home's top-left lockup: the mark, "Rillwood" and a small "kids" tag - it reads as a logo, not a button. The
// grown-up hold on it comes with the gate (roadmap Kids mode task 4).
import { StyleSheet, View } from 'react-native';

import { LogoMark } from '@/components/LogoMark';
import { Text } from '@/components/Text';
import { kids, radii, spacing, useColors } from '@/theme';

export function KidsBrand() {
  const c = useColors();
  return (
    <View style={styles.row} accessible accessibilityLabel="Rillwood kids">
      <LogoMark size={kids.mark} />
      <Text style={kids.type.brand}>Rillwood</Text>
      <View style={[styles.tag, { backgroundColor: c.elevated }]}>
        <Text style={[kids.type.tag, { color: c.textSecondary }]}>kids</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tag: { ...kids.tag, borderRadius: radii.pill },
});
