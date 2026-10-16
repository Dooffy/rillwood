// SPDX-License-Identifier: GPL-3.0-or-later
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { accountDownloads, deleteAccountDownloads } from '@/downloads';
import { formatBytes } from '@/format';
import { removeAccount, signOut, useSession, type Account as SavedAccount } from '@/session';
import { accountStatus, signInAgain, useSwitchAccount, type AccountStatus } from '@/components/AccountList';
import { Avatar } from '@/components/Avatar';
import { ListAction, ListRow, ListSection } from '@/components/List';
import { Page } from '@/components/Page';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { resetTo } from '@/navigation';
import { radii, spacing, useColors } from '@/theme';

/** "Active on Home", "Signed in on Home", "Signed out of Home". */
const STATUS_LINE: Record<AccountStatus, (server: string) => string> = {
  active: (server) => `Active on ${server}`,
  signedIn: (server) => `Signed in on ${server}`,
  signedOut: (server) => `Signed out of ${server}`,
};

/** One account (`id`, default the active one): profile, server details, switch / sign in, sign out, remove. */
export default function Account() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { accounts, active } = useSession();
  const switchTo = useSwitchAccount();
  const toast = useToast();
  const c = useColors();
  const account = id ? accounts.find((a) => a.id === id) : active;
  // Removed (this screen is closing) or signed out (the root layout's redirect is already moving away).
  if (!account) return null;
  const status = accountStatus(account, active?.id);
  const isActive = status === 'active';

  /**
   * After sign out / remove. Another account took over → its Home, stack cleared, as a switch from the list does; the
   * last signed-in one went → the signed-out redirect takes over (already signed out - saved accounts from Welcome -
   * there's no redirect, so back); otherwise back to the list.
   */
  const leave = (next: SavedAccount | null) => {
    if (!next && active) return;
    if (next && isActive) {
      toast(`Switched to ${next.userName}`);
      resetTo('/home');
    } else router.back();
  };

  // Sign out / remove take the account's downloads with them. Read at the tap (the screen doesn't show them);
  // '' when it has none.
  const downloadsLine = () => {
    const downloads = accountDownloads(account.id);
    if (downloads.length === 0) return '';
    const count = downloads.length === 1 ? 'Its download' : `Its ${downloads.length} downloads`;
    // What's on the phone: an unfinished one only has its bytes so far.
    const bytes = downloads.reduce((sum, d) => sum + (d.status === 'done' ? d.total : d.bytes), 0);
    return `${count} (${formatBytes(bytes)}) will be deleted from this phone.`;
  };

  const remove = () => {
    const line = downloadsLine();
    Alert.alert(
      `Remove ${account.userName}?`,
      `You'll need to sign in again to use ${account.server.name} with this account.${line && ` ${line}`}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            deleteAccountDownloads(account.id);
            leave(removeAccount(account.id));
          },
        },
      ],
    );
  };

  // Signing out another account keeps this screen (it now reads Signed out).
  const signOutNow = () => {
    deleteAccountDownloads(account.id);
    const next = signOut(account.id);
    if (isActive) leave(next);
  };
  // Asks only when downloads would go.
  const signOutHere = () => {
    const line = downloadsLine();
    if (!line) return signOutNow();
    Alert.alert(`Sign out of ${account.userName}?`, line, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOutNow },
    ]);
  };

  return (
    <Page>
      <View style={styles.profile}>
        <Avatar name={account.userName} size={80} />
        <Text variant="sectionHeader" accessibilityRole="header">
          {account.userName}
        </Text>
        <View style={styles.status}>
          <View
            style={[
              styles.dot,
              { backgroundColor: { active: c.success, signedIn: c.iconInactive, signedOut: c.elevated2 }[status] },
            ]}
          />
          <Text secondary>{STATUS_LINE[status](account.server.name)}</Text>
        </View>
      </View>
      <ListSection title="Server">
        <ListRow label="Name" value={account.server.name} />
        <ListRow label="Address" value={account.server.url} />
        <ListRow label="Version" value={account.server.version} />
      </ListSection>
      <ListSection
        footer={
          account.signedOut
            ? 'Remove forgets this account on this device.'
            : "Sign out keeps the account here so you can sign back in. Remove forgets it on this device. Both delete the account's downloads."
        }
      >
        {account.signedOut ? (
          <ListAction label="Sign in" onPress={() => signInAgain(account)} />
        ) : (
          !isActive && <ListAction label="Switch to this account" onPress={() => switchTo(account)} />
        )}
        {!account.signedOut && <ListAction label="Sign out" onPress={signOutHere} />}
        <ListAction label="Remove account" destructive onPress={remove} />
      </ListSection>
    </Page>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  dot: { width: 8, height: 8, borderRadius: radii.pill },
});
