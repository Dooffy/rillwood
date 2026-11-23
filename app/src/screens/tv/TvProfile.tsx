// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV profile tab (the icon at the right end of the tab bar, draft docs/research/tv-profile-access.html): who's
// signed in on the left (avatar, name, server), the ways out on the right - Switch Account (Who's Watching), Settings,
// Sign Out (asks first). Reached from every tab with the system's own focus: Up to the bar, Right to the icon.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import { TvButton } from '@/components/tv/TvButton';
import { signOut, useSession } from '@/session';
import { tv, useColors } from '@/theme';

export function TvProfile() {
  const c = useColors();
  const { active } = useSession();
  const [asking, setAsking] = useState(false);
  if (!active) return <View style={[styles.root, { backgroundColor: c.background }]} />;
  return (
    <View testID="tv-profile" style={[styles.root, { backgroundColor: c.background }]}>
      <View style={styles.who}>
        <Avatar name={active.userName} size={tv.profile.avatar} />
        <Text accessibilityRole="header" style={[tv.type.title, styles.center]} numberOfLines={1}>
          {active.userName}
        </Text>
        <Text secondary style={[tv.type.caption, styles.center]} numberOfLines={1}>
          {active.server.name}
        </Text>
      </View>
      {/* One column: Up / Down move through it, Up from the first goes to the tab bar. */}
      <View style={styles.actions}>
        <TvButton
          wide
          variant="primary"
          icon="person.2"
          title="Switch Account"
          onPress={() => router.push('/accounts')}
        />
        <TvButton wide icon="gearshape" title="Settings" onPress={() => router.push('/settings')} />
        <TvButton
          wide
          variant="quiet"
          icon="rectangle.portrait.and.arrow.right"
          title="Sign Out"
          onPress={() => setAsking(true)}
        />
      </View>
      <ActionSheet
        visible={asking}
        title={`Sign out of ${active.userName} on ${active.server.name}?`}
        actions={[{ label: 'Sign Out', destructive: true, onPress: () => signOut(active.id) }]}
        onClose={() => setAsking(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: tv.tabBarInset,
    paddingHorizontal: tv.margin,
    gap: tv.gap.lg,
  },
  who: { flex: 1, alignItems: 'center', gap: tv.gap.sm },
  center: { textAlign: 'center' },
  actions: { width: tv.detail.creditsWidth, gap: tv.gap.sm },
});
