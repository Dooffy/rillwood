// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { removeAccount, signOut, useSession } from '@/session';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ListRow, ListSection } from '@/components/List';
import { Page } from '@/components/Page';
import { Text } from '@/components/Text';
import { spacing } from '@/theme';

/** Current user: profile, server details, switch / sign out / remove. */
export default function Account() {
  const { active } = useSession();
  // Signed out: the root layout's redirect is already moving away.
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
          // Another account took over → back to Settings; none → the signed-out redirect takes over.
          onPress: () => {
            if (removeAccount(active.id)) router.back();
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
      <Button title="Sign out" variant="secondary" onPress={() => signOut(active.id)} />
      <Button title="Remove account" variant="destructive" onPress={remove} />
    </Page>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
});
