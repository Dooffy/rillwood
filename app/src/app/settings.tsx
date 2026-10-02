// SPDX-License-Identifier: GPL-3.0-or-later
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ListRow, ListSection } from '@/components/List';
import { Segmented } from '@/components/Segmented';
import { APPEARANCE_OPTIONS, setAppearance, useAppearance } from '@/settings';
import { spacing } from '@/theme';

// Downloads rows show the defaults (CLAUDE.md §2); they become editable in M5 / M6.
export default function Settings() {
  const appearance = useAppearance();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <ListSection title="Account">
        <ListRow label="Accounts" onPress={() => router.push('/accounts')} />
      </ListSection>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg },
  segmented: { padding: spacing.sm },
});
