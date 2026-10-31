// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import { spacing, useWide } from '@/theme';

import { Avatar } from './Avatar';
import { Text } from './Text';

export const PERSON_SIZE = 72;
/** Wide screens (iPad): bigger photos, in step with the bigger cards there. */
export const WIDE_PERSON_SIZE = 96;

/** Photo size and card width (the photo plus room for the name under it) for this window. */
export function usePersonSize(): { size: number; cardWidth: number } {
  const size = useWide() ? WIDE_PERSON_SIZE : PERSON_SIZE;
  return { size, cardWidth: size + spacing.md };
}

/** Cast / crew entry: round photo (initials without one), name, role. Not tappable - no person screen yet. */
export function PersonCard({ name, role, image }: { name: string; role?: string; image?: string }) {
  const { size, cardWidth } = usePersonSize();
  return (
    <View accessible accessibilityLabel={role ? `${name}, ${role}` : name} style={[styles.card, { width: cardWidth }]}>
      <Avatar name={name} image={image} size={size} />
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
  card: { alignItems: 'center', gap: spacing.xs },
  center: { textAlign: 'center' },
});
