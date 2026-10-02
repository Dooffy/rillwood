// SPDX-License-Identifier: GPL-3.0-or-later
import { NativeTabs, type NativeTabsTriggerIconProps } from 'expo-router/native-tabs';

import { useColors } from '@/theme';

const TABS: { name: string; label: string; icon: NativeTabsTriggerIconProps }[] = [
  { name: 'home', label: 'Home', icon: { sf: { default: 'house', selected: 'house.fill' }, md: 'home' } },
  { name: 'library', label: 'Library', icon: { sf: 'rectangle.stack', md: 'video_library' } },
  { name: 'search', label: 'Search', icon: { sf: 'magnifyingglass', md: 'search' } },
  { name: 'downloads', label: 'Downloads', icon: { sf: 'arrow.down.circle', md: 'download' } },
];

export default function TabsLayout() {
  const c = useColors();
  return (
    <NativeTabs
      tintColor={c.text}
      iconColor={{ default: c.iconInactive, selected: c.text }}
      backgroundColor={c.background}
    >
      {TABS.map((t) => (
        // Nested navigators don't inherit the root contentStyle.
        <NativeTabs.Trigger key={t.name} name={t.name} contentStyle={{ backgroundColor: c.background }}>
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon {...t.icon} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
