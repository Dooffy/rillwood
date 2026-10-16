// SPDX-License-Identifier: GPL-3.0-or-later
import { NativeTabs } from 'expo-router/native-tabs';
import { StyleSheet, View } from 'react-native';

import { TabsSidebar } from '@/components/TabsSidebar';
import { TAB_TITLES, TABS } from '@/navigation';
import { useColors, useWideLandscape } from '@/theme';

export default function TabsLayout() {
  const c = useColors();
  // Tablet in landscape: our own sidebar, always shown; the native tab bar hides. One navigator either way, so rotating
  // keeps every tab's state.
  const sidebar = useWideLandscape();
  return (
    <View style={styles.root}>
      {sidebar && <TabsSidebar />}
      <View style={styles.tabs}>
        <NativeTabs
          hidden={sidebar}
          // iPad portrait (iPadOS 18+): the tab bar can turn into the system sidebar; no effect on iPhone.
          sidebarAdaptable={!sidebar}
          tintColor={c.text}
          iconColor={{ default: c.iconInactive, selected: c.text }}
          backgroundColor={c.background}
        >
          {TABS.map((t) => (
            // Nested navigators don't inherit the root contentStyle.
            <NativeTabs.Trigger key={t.name} name={t.name} contentStyle={{ backgroundColor: c.background }}>
              <NativeTabs.Trigger.Label>{TAB_TITLES[t.name]}</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon sf={{ default: t.sf, selected: t.sfSelected }} md={t.md} />
            </NativeTabs.Trigger>
          ))}
        </NativeTabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  tabs: { flex: 1 },
});
