// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { removeAccount, useAccounts } from '@/auth';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ListRow, ListSection } from '@/components/List';
import { Page } from '@/components/Page';
import { Text } from '@/components/Text';
import { spacing } from '@/theme';

/** Current user: profile, server details, switch / remove. */
export default function Account() {
  const { active, accounts } = useAccounts();
  // Signed out: the root layout's redirect is already moving to Add server.
  if (!active) return null;

  const remove = () =>
    Alert.alert(
      `Remove ${active.userName}?`,
      `You'll need to sign in again to use ${active.server.name} with this account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            // Last account: the root layout's signed-out redirect takes over.
            if (accounts.length > 1) router.back();
            removeAccount(active.id);
          },
        },
      ],
    );

  return (
    <Page>
      <View style={styles.profile}>
        <Avatar name={active.userName} size={96} />
        <Text variant="sectionHeader">{active.userName}</Text>
      </View>
      <ListSection title="Server">
        <ListRow label="Name" value={active.server.name} />
        <ListRow label="Address" value={active.server.url} />
        <ListRow label="Version" value={active.server.version} />
      </ListSection>
      <Button title="Switch user" variant="secondary" onPress={() => router.push('/accounts')} />
      <Button title="Remove account" variant="destructive" onPress={remove} />
    </Page>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
});
