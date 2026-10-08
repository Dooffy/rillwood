// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { removeAccount, signOut, switchAccount, useSession, type Account } from '@/session';
import { Button } from '@/components/Button';
import { ListRow, ListSection, type ListRowProps } from '@/components/List';
import { Message } from '@/components/Message';
import { Page } from '@/components/Page';
import { resetTo } from '@/navigation';

/** Accounts grouped by server, in the order they were added. */
function groupByServer(accounts: Account[]): Account[][] {
  const groups = new Map<string, Account[]>();
  for (const a of accounts) {
    const group = groups.get(a.server.url);
    if (group) group.push(a);
    else groups.set(a.server.url, [a]);
  }
  return [...groups.values()];
}

export default function Accounts() {
  const { accounts, active } = useSession();

  const signInAgain = (account: Account) =>
    router.push({ pathname: '/login', params: { url: account.server.url, userName: account.userName } });

  /** Signed out → Sign in, active → Sign out, otherwise Switch. */
  function primaryAction(account: Account) {
    if (account.signedOut) return { text: 'Sign in', onPress: () => signInAgain(account) };
    if (account.id === active?.id) return { text: 'Sign out', onPress: () => signOut(account.id) };
    return {
      text: 'Switch to this account',
      onPress: () => {
        switchAccount(account.id);
        // Signed out, this screen is the stack root - go into the app.
        if (!active) resetTo('/home');
      },
    };
  }

  function manage(account: Account) {
    Alert.alert(account.userName, account.server.url, [
      primaryAction(account),
      {
        text: 'Remove account',
        style: 'destructive' as const,
        onPress: () => removeAccount(account.id),
      },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  /** Only states that need attention: the current account and signed-out ones. Other rows stay clean. */
  const status = (a: Account): Pick<ListRowProps, 'value' | 'dot'> =>
    a.signedOut ? { value: 'Signed out', dot: 'muted' } : a.id === active?.id ? { value: 'Active', dot: 'active' } : {};

  return (
    <Page>
      {accounts.length === 0 && <Message text="No accounts yet. Add a Jellyfin server to sign in." />}
      {groupByServer(accounts).map((list) => (
        <ListSection key={list[0].server.url} title={list[0].server.name}>
          {list.map((a) => (
            <ListRow key={a.id} label={a.userName} {...status(a)} onPress={() => manage(a)} />
          ))}
          <ListRow
            label="Add user"
            onPress={() => router.push({ pathname: '/login', params: { url: list[0].server.url } })}
          />
        </ListSection>
      ))}
      <Button title="Add server" onPress={() => router.push('/server')} />
    </Page>
  );
}
