// SPDX-License-Identifier: GPL-3.0-or-later
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Chevron, ListRow, ListSection } from '@/components/List';
import { Page } from '@/components/Page';
import { OptionRow } from '@/components/OptionList';
import { Text } from '@/components/Text';
import { ONBOARDING } from '@/navigation';
import { useSession } from '@/session';
import { usePicker } from '@/pickers';
import { formatDownloadLimit, useDownloadLimit } from '@/settings';
import { minTouch, radii, spacing, useColors } from '@/theme';

// Remove watched shows the default (CLAUDE.md §2) until offload lands in M6.
export default function Settings() {
  const subtitleSize = usePicker('subtitle-size').choice?.label;
  const subtitleColour = usePicker('subtitle-colour').choice?.label;
  const downloadLimit = useDownloadLimit();
  const { accounts, active } = useSession();
  const c = useColors();

  return (
    <Page>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? `${active.userName}, ${active.server.name}` : 'Sign in'}
        // Signed out: saved accounts, else Add server as onboarding (Welcome has no header to come back from).
        onPress={() =>
          router.push(
            active ? '/account' : accounts.length > 0 ? '/accounts' : { pathname: '/server', params: ONBOARDING },
          )
        }
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
      <ListSection>
        <OptionRow option="appearance" />
        <ListRow
          label="Subtitles"
          value={`${subtitleSize}, ${subtitleColour}`}
          onPress={() => router.push('/subtitles')}
        />
      </ListSection>
      <ListSection title="Downloads">
        <OptionRow option="download-network" />
        <ListRow
          label="Storage limit"
          value={formatDownloadLimit(downloadLimit)}
          onPress={() => router.push('/download-storage')}
        />
        <ListRow label="Remove watched" value="After 7 days" />
      </ListSection>
      <ListSection title="About">
        <ListRow label="Version" value={Constants.expoConfig?.version ?? '-'} />
      </ListSection>
    </Page>
  );
}

const styles = StyleSheet.create({
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
