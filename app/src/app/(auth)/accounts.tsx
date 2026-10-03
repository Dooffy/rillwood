// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { removeAccount, switchAccount, useAccounts, type Account } from '@/auth';
import { Button } from '@/components/Button';
import { ListRow, ListSection } from '@/components/List';
import { Page } from '@/components/Page';
import { Text } from '@/components/Text';

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
  const { accounts, activeId } = useAccounts();

  function manage(account: Account) {
    const active = account.id === activeId;
    Alert.alert(account.userName, account.server.url, [
      ...(active ? [] : [{ text: 'Switch to this account', onPress: () => switchAccount(account.id) }]),
      {
        text: 'Remove account',
        style: 'destructive' as const,
        onPress: () => removeAccount(account.id),
      },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  return (
    <Page>
      {accounts.length === 0 && <Text secondary>No accounts yet.</Text>}
      {groupByServer(accounts).map((list) => (
        <ListSection key={list[0].server.url} title={list[0].server.name}>
          {list.map((a) => (
            <ListRow
              key={a.id}
              label={a.userName}
              value={a.id === activeId ? 'Active' : undefined}
              onPress={() => manage(a)}
            />
          ))}
          <ListRow label="Add user" onPress={() => router.push({ pathname: '/login', params: list[0].server })} />
        </ListSection>
      ))}
      <Button title="Add server" onPress={() => router.push('/server')} />
    </Page>
  );
}
