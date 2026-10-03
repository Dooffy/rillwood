// SPDX-License-Identifier: GPL-3.0-or-later
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Chevron, ListRow, ListSection } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { Text } from '@/components/Text';
import { signedOutHome } from '@/navigation';
import { useSession } from '@/session';
import { APPEARANCE_OPTIONS, setAppearance, useAppearance } from '@/settings';
import { minTouch, radii, spacing, useColors } from '@/theme';

// Downloads rows show the defaults (CLAUDE.md §2); they become editable in M5 / M6.
export default function Settings() {
  const appearance = useAppearance();
  const { accounts, active } = useSession();
  const c = useColors();

  return (
    <Page>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? `${active.userName}, ${active.server.name}` : 'Sign in'}
        onPress={() => router.push(active ? '/account' : signedOutHome(accounts))}
        style={({ pressed }) => [styles.profile, { backgroundColor: pressed ? c.elevated : c.surface }]}
      >
        <Avatar name={active?.userName} />
        <View style={styles.profileText}>
          <Text variant="sectionHeader" numberOfLines={1}>
            {active ? active.userName : 'Sign in'}
          </Text>
          <Text secondary numberOfLines={1}>
            {active ? active.server.name : 'Add a Jellyfin server'}
          </Text>
        </View>
        <Chevron />
      </Pressable>
      <ListSection title="Appearance">
        <View style={styles.segmented}>
          <Segmented options={APPEARANCE_OPTIONS} value={appearance} onChange={setAppearance} />
        </View>
      </ListSection>
      <ListSection title="Downloads">
        <ListRow label="Network" value="Wi-Fi only" />
        <ListRow label="Remove watched" value="After 7 days" />
      </ListSection>
      <ListSection title="About">
        <ListRow label="Version" value={Constants.expoConfig?.version ?? '-'} />
      </ListSection>
    </Page>
  );
}

const styles = StyleSheet.create({
  segmented: { padding: spacing.sm },
  profile: {
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.cardLarge,
  },
  profileText: { flex: 1, gap: spacing.xs / 2 },
});
