// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { resetTo } from '@/navigation';
import { serverHost } from '@/server';
import { switchAccount, useSession, type Account, type Server } from '@/session';
import { spacing, useColors } from '@/theme';

import { ActionSheet } from './ActionSheet';
import { Avatar } from './Avatar';
import { IconButton } from './IconButton';
import { Checkmark, ListRow, ListSection } from './List';
import { Text } from './Text';
import { useToast } from './Toast';

const AVATAR_SIZE = 36;

/** Servers saved with an account, once each, in the order they were added. */
export function savedServers(accounts: Account[]): Server[] {
  const servers = new Map<string, Server>();
  for (const a of accounts) if (!servers.has(a.server.url)) servers.set(a.server.url, a.server);
  return [...servers.values()];
}

function openAccount(account: Account) {
  router.push({ pathname: '/account', params: { id: account.id } });
}

export type AccountStatus = 'active' | 'signedIn' | 'signedOut';

/** Where an account stands: the one in use, signed in (switch with a tap), or signed out (sign in again). */
export function accountStatus(account: Account, activeId: string | undefined): AccountStatus {
  if (account.signedOut) return 'signedOut';
  return account.id === activeId ? 'active' : 'signedIn';
}

/** Sign a signed-out account back in: its server, username prefilled. */
export function signInAgain(account: Account) {
  router.push({ pathname: '/login', params: { url: account.server.url, userName: account.userName } });
}

/** Switch and land on the new account's Home (the stack clears - screens of the old account go). */
export function useSwitchAccount() {
  const toast = useToast();
  return (account: Account) => {
    switchAccount(account.id);
    toast(`Switched to ${account.userName}`);
    resetTo('/home');
  };
}

/**
 * Every saved account (Settings, Welcome → saved accounts). Tap: switch (active → its details, signed out → Sign in);
 * (i): details. Add account picks a saved server or a new one.
 */
export function AccountsSection() {
  const { accounts, active } = useSession();
  const switchTo = useSwitchAccount();
  const [adding, setAdding] = useState(false);
  const servers = savedServers(accounts);

  const press = (a: Account) => {
    if (a.signedOut) signInAgain(a);
    else if (a.id === active?.id) openAccount(a);
    else switchTo(a);
  };

  // No saved server: straight to Add server.
  const add = () => (servers.length > 0 ? setAdding(true) : router.push('/server'));

  return (
    <>
      <ListSection title="Accounts">
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} status={accountStatus(a, active?.id)} onPress={() => press(a)} />
        ))}
        <ListRow label="Add account" onPress={add} />
      </ListSection>
      <ActionSheet
        visible={adding}
        title="Add an account on"
        actions={[
          ...servers.map((s) => ({
            label: s.name,
            detail: serverHost(s.url),
            onPress: () => router.push({ pathname: '/login', params: { url: s.url } }),
          })),
          { label: 'New server', onPress: () => router.push('/server') },
        ]}
        onClose={() => setAdding(false)}
      />
    </>
  );
}

const STATUS_VALUE: Record<AccountStatus, string | undefined> = {
  active: 'Active',
  signedIn: undefined,
  signedOut: 'Signed out',
};

function AccountRow({ account, status, onPress }: { account: Account; status: AccountStatus; onPress: () => void }) {
  const c = useColors();
  const { userName, server } = account;
  const value = STATUS_VALUE[status];
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${userName}, ${server.name}`}
        accessibilityValue={value ? { text: value } : undefined}
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && { backgroundColor: c.elevated }]}
      >
        <Avatar name={userName} size={AVATAR_SIZE} />
        <View style={styles.text}>
          <Text numberOfLines={1}>{userName}</Text>
          <Text variant="caption" secondary numberOfLines={1}>
            {server.name}
          </Text>
        </View>
        {status === 'active' && <Checkmark />}
        {status === 'signedOut' && <Text secondary>Sign in</Text>}
      </Pressable>
      <IconButton
        variant="plain"
        icon={{ ios: 'info.circle', android: 'info' }}
        label={`${userName} on ${server.name}, details`}
        onPress={() => openAccount(account)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.xs },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1, gap: 2 },
});
