// SPDX-License-Identifier: GPL-3.0-or-later
import { router, usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TAB_TITLES, TABS } from '@/navigation';
import { isTabletScreen, isWideLandscape, minTouch, radii, spacing, useColors } from '@/theme';

import { Text } from './Text';

/** Sidebar width: room for the longest label (Downloads) at the large row size. */
const SIDEBAR_WIDTH = 260;

/**
 * Width a tab screen gets: the window, less the sidebar while it shows (tablet landscape). Phones: the upright width -
 * the tabs stay portrait, even while the player above them is turned.
 */
export function useTabContentWidth(): number {
  const { width, height } = useWindowDimensions();
  if (!isTabletScreen(Dimensions.get('screen'))) return Math.min(width, height);
  // Apple TV: the system's top tab bar takes no width.
  return isWideLandscape(width, height) && !Platform.isTV ? width - SIDEBAR_WIDTH : width;
}

const tabOf = (path: string) => TABS.find((tab) => path === `/${tab.name}`)?.name;

/**
 * Tablet in landscape: the tabs as a fixed sidebar on the left (always shown - the native iPad sidebar can be hidden by
 * the user). Same tabs, same routes; the native tab bar is hidden meanwhile.
 */
export function TabsSidebar() {
  const c = useColors();
  // A screen pushed over the tabs (detail, Settings) keeps the tab it came from selected (seen during a back swipe).
  const current = tabOf(usePathname());
  const [lastTab, setLastTab] = useState(current ?? 'home');
  if (current && current !== lastTab) setLastTab(current);
  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left']}
      style={[styles.bar, { backgroundColor: c.surface, borderRightColor: c.separator }]}
    >
      <View accessibilityRole="tablist" style={styles.list}>
        {TABS.map((tab) => {
          const selected = tab.name === lastTab;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityLabel={TAB_TITLES[tab.name]}
              accessibilityState={{ selected }}
              onPress={() => router.navigate(`/${tab.name}`)}
              style={({ pressed }) => [
                styles.row,
                (selected || pressed) && { backgroundColor: selected ? c.elevated2 : c.elevated },
              ]}
            >
              <SymbolView
                name={{ ios: selected ? tab.sfSelected : tab.sf, android: tab.md }}
                tintColor={selected ? c.text : c.iconInactive}
                size={22}
              />
              <Text variant="button" style={!selected && { fontWeight: '400' }}>
                {TAB_TITLES[tab.name]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { width: SIDEBAR_WIDTH, borderRightWidth: StyleSheet.hairlineWidth },
  list: { padding: spacing.sm, paddingTop: spacing.lg, gap: spacing.xs },
  row: {
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
});
