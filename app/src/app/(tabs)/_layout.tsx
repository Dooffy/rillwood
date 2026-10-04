// SPDX-License-Identifier: GPL-3.0-or-later
import { NativeTabs, type NativeTabsTriggerIconProps } from 'expo-router/native-tabs';

import { TAB_TITLES } from '@/navigation';
import { useColors } from '@/theme';

const TABS: { name: keyof typeof TAB_TITLES; icon: NativeTabsTriggerIconProps }[] = [
  { name: 'home', icon: { sf: { default: 'house', selected: 'house.fill' }, md: 'home' } },
  { name: 'library', icon: { sf: 'rectangle.stack', md: 'video_library' } },
  { name: 'downloads', icon: { sf: 'arrow.down.circle', md: 'download' } },
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
          <NativeTabs.Trigger.Label>{TAB_TITLES[t.name]}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon {...t.icon} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
