// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Who's Watching (screen draft 03): every saved account across servers as a big circle with the name and
// server under it, then Add. Shown at launch with two or more signed-in accounts and from the avatar on the tabs.
// Focus starts on the active (last used) account. Click: switch (signed out: Sign in); hold: Sign Out / Remove.
// No downloads on TV, so Sign Out / Remove have none to delete or warn about.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TVFocusGuideView, View } from 'react-native';

import { accountStatus, savedServers, signInAgain } from '@/components/AccountList';
import { ActionSheet } from '@/components/ActionSheet';
import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import { TvButton } from '@/components/tv/TvButton';
import { resetTo } from '@/navigation';
import { serverHost } from '@/server';
import { removeAccount, signOut, switchAccount, useSession, type Account } from '@/session';
import { tv, useColors } from '@/theme';

/** The menu open: an account's (hold), Remove's confirmation, or Add's server list. */
type Menu = { kind: 'account' | 'remove'; account: Account } | { kind: 'add' };

export function TvAccounts() {
  const c = useColors();
  const { accounts, active } = useSession();
  const [menu, setMenu] = useState<Menu>();
  const servers = savedServers(accounts);
  // Last used first in focus: the active one, else the first.
  const focusId = active?.id ?? accounts[0]?.id;

  const open = (a: Account) => {
    if (a.signedOut) return signInAgain(a);
    if (a.id !== active?.id) switchAccount(a.id);
    resetTo('/home');
  };
  // No saved server: the address screen (Welcome asks for it on TV).
  const add = () => (servers.length > 0 ? setMenu({ kind: 'add' }) : router.push('/welcome'));

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {/* Full width: a swipe up from any account lands on Settings. */}
      <TVFocusGuideView autoFocus style={styles.top}>
        <TvButton round title="Settings" icon="gearshape" onPress={() => router.push('/settings')} />
      </TVFocusGuideView>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={[tv.type.title, styles.center]}>
          Who&apos;s watching?
        </Text>
        <TVFocusGuideView autoFocus>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {accounts.map((a) => (
              <Profile
                key={a.id}
                name={a.userName}
                detail={a.signedOut ? `${a.server.name} · Signed out` : a.server.name}
                preferredFocus={a.id === focusId}
                onPress={() => open(a)}
                onLongPress={() => setMenu({ kind: 'account', account: a })}
              />
            ))}
            <Profile add name="Add" detail="Account" preferredFocus={focusId === undefined} onPress={add} />
          </ScrollView>
        </TVFocusGuideView>
      </View>
      <ActionSheet
        visible={menu !== undefined && menu.kind !== 'remove'}
        {...sheet(menu, servers, setMenu, active?.id)}
      />
      {/* Its own sheet, so it opens as a new menu (focus on Remove) after the account's closes. */}
      <ActionSheet
        visible={menu?.kind === 'remove'}
        title={
          menu?.kind === 'remove'
            ? `Remove ${menu.account.userName}? You'll need to sign in again to use ${menu.account.server.name} with this account.`
            : undefined
        }
        actions={
          menu?.kind === 'remove'
            ? [{ label: 'Remove', destructive: true, onPress: () => removeAccount(menu.account.id) }]
            : []
        }
        onClose={() => setMenu(undefined)}
      />
    </View>
  );
}

/** What the open menu shows. */
function sheet(
  menu: Menu | undefined,
  servers: ReturnType<typeof savedServers>,
  setMenu: (menu: Menu | undefined) => void,
  activeId: string | undefined,
) {
  const onClose = () => setMenu(undefined);
  if (menu?.kind === 'add')
    return {
      title: 'Add an account on',
      actions: [
        ...servers.map((s) => ({
          label: s.name,
          detail: serverHost(s.url),
          onPress: () => router.push({ pathname: '/login', params: { url: s.url } }),
        })),
        { label: 'New server', onPress: () => router.push('/welcome') },
      ],
      onClose,
    };
  if (menu?.kind === 'account') {
    const { account } = menu;
    const status = accountStatus(account, activeId);
    return {
      title: `${account.userName} on ${account.server.name}`,
      actions: [
        ...(status === 'signedOut' ? [] : [{ label: 'Sign Out', onPress: () => signOut(account.id) }]),
        {
          label: 'Remove',
          destructive: true,
          // Picking an action closes the menu first; the confirmation opens after.
          onPress: () => setMenu({ kind: 'remove', account }),
        },
      ],
      onClose,
    };
  }
  return { actions: [], onClose };
}

type ProfileProps = {
  name: string;
  detail: string;
  add?: boolean;
  preferredFocus?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

/** One account (or Add): a big circle that grows with a ring on focus, the name and server under it. */
function Profile({ name, detail, add, preferredFocus, onPress, onLongPress }: ProfileProps) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={add ? 'Add Account' : `${name}, ${detail}`}
      accessibilityHint={onLongPress ? 'Hold for Sign Out and Remove' : undefined}
      hasTVPreferredFocus={preferredFocus}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.profile}
    >
      {({ focused }) => (
        <>
          <View style={[styles.circle, { borderColor: focused ? c.text : 'transparent' }, focused && styles.focused]}>
            {add ? (
              <View style={[styles.add, { backgroundColor: c.elevated2 }]}>
                <Text secondary style={styles.plus}>
                  +
                </Text>
              </View>
            ) : (
              <Avatar name={name} size={tv.profile.avatar} />
            )}
          </View>
          <View style={styles.label}>
            <Text numberOfLines={1} style={[tv.type.button, styles.center]}>
              {name}
            </Text>
            <Text secondary numberOfLines={1} style={[tv.type.caption, styles.center]}>
              {detail}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

const ring = tv.profile.ring;

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: tv.marginTop, paddingHorizontal: tv.margin },
  content: { flex: 1, justifyContent: 'center', gap: tv.gap.lg, paddingBottom: tv.marginTop + tv.button.height },
  center: { textAlign: 'center' },
  // Centred when the accounts fit; room above / below for a focused circle to grow.
  row: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: tv.profile.gap,
    paddingHorizontal: tv.margin,
    paddingVertical: tv.shelf.focusRoom,
  },
  profile: { alignItems: 'center', gap: tv.gap.sm, width: tv.profile.avatar + 2 * ring },
  circle: { borderRadius: tv.profile.avatar, borderWidth: ring },
  focused: { transform: [{ scale: tv.focus.cardScale }], ...tv.focus.shadow },
  add: {
    width: tv.profile.avatar,
    height: tv.profile.avatar,
    borderRadius: tv.profile.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: { fontSize: tv.profile.avatar * 0.45, fontWeight: '300' },
  label: { alignSelf: 'stretch', gap: 2 },
});
