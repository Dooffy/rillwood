// SPDX-License-Identifier: GPL-3.0-or-later
// Address help for Add server: "Where do I find it?". Shown in onboarding and from Add account.
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { radii, spacing, useColors } from '@/theme';

import { Text } from './Text';

const WHERE = [
  'At home: the computer running Jellyfin plus port 8096. Its Dashboard - Networking page shows the address.',
  "Away from home: the web address your server's owner gave you.",
  'No server yet? Jellyfin is free to install on a computer or NAS.',
];

/** Numbered "Where do I find it?" card. */
export function WhereToFindServer() {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.surface }]}>
      <View style={styles.cardTitle}>
        <SymbolView name={{ ios: 'questionmark.circle', android: 'help' }} tintColor={c.text} size={20} />
        <Text variant="label" accessibilityRole="header">
          Where do I find it?
        </Text>
      </View>
      {WHERE.map((line, i) => (
        <View key={line} style={styles.step}>
          <View style={[styles.number, { backgroundColor: c.elevated2 }]}>
            <Text variant="caption" maxFontSizeMultiplier={1.5}>
              {i + 1}
            </Text>
          </View>
          <Text variant="caption" secondary style={styles.stepText}>
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: spacing.md, gap: spacing.md },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { flexDirection: 'row', gap: spacing.sm + spacing.xs },
  number: { minWidth: 24, minHeight: 24, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1 },
});
