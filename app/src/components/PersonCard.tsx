// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';

import { Avatar } from './Avatar';
import { Text } from './Text';

export const PERSON_SIZE = 72;
/** A card's width: the photo plus room for the name under it. */
export const PERSON_CARD_WIDTH = PERSON_SIZE + spacing.md;

/** Cast / crew entry: round photo (initials without one), name, role. Not tappable - no person screen yet. */
export function PersonCard({ name, role, image }: { name: string; role?: string; image?: string }) {
  return (
    <View accessible accessibilityLabel={role ? `${name}, ${role}` : name} style={styles.card}>
      <Avatar name={name} image={image} size={PERSON_SIZE} />
      <Text variant="caption" numberOfLines={2} style={styles.center}>
        {name}
      </Text>
      {role !== undefined && (
        <Text variant="caption" secondary numberOfLines={2} style={styles.center}>
          {role}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: PERSON_CARD_WIDTH, alignItems: 'center', gap: spacing.xs },
  center: { textAlign: 'center' },
});
