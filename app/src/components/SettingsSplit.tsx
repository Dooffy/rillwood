// SPDX-License-Identifier: GPL-3.0-or-later
// Settings on a tablet in landscape, iOS Settings style: the list on the left, the page a row opens on the right
// (the active account's details until a row is picked). A page opened from the pane (Subtitles → Size) goes over it
// with a back button; a row in the list starts the pane over.
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PICKERS } from '@/pickers';
import { useSession } from '@/session';
import { scrollList, spacing, useColors } from '@/theme';

import { AccountDetails } from './AccountDetails';
import { IconButton } from './IconButton';
import { pageColumn, pageContent } from './Page';
import { linkKey, SETTINGS_TITLES, SettingsPaneContext, type SettingsLink } from './SettingsLink';
import { OptionSettings, StorageSettings, SubtitlesSettings } from './SettingsPages';
import { Text } from './Text';

/** Width of the list side (iPad Settings). */
const LIST_WIDTH = 380;

/** The pane's heading; the account page has its profile on top instead. */
function title(link: SettingsLink): string | undefined {
  if (link.page === 'account') return undefined;
  return link.page === 'option' ? PICKERS[link.key].title : SETTINGS_TITLES[link.page];
}

function PaneContent({ link }: { link: SettingsLink }) {
  if (link.page === 'account') return <AccountDetails id={link.id} onBack={() => {}} />;
  if (link.page === 'subtitles') return <SubtitlesSettings />;
  if (link.page === 'option') return <OptionSettings option={link.key} />;
  return <StorageSettings />;
}

/** `children`: the Settings list (its rows open pages through `useSettingsLink`). */
export function SettingsSplit({ children }: { children: ReactNode }) {
  const c = useColors();
  const { accounts, active } = useSession();
  // Pages open in the pane, the last one shown; empty = the active account.
  const [opened, setOpened] = useState<SettingsLink[]>([]);
  // An account removed while shown: back to the default.
  const first = opened[0];
  const gone = first?.page === 'account' && !accounts.some((a) => a.id === first.id);
  const fallback: SettingsLink[] = active ? [{ page: 'account', id: active.id }] : [];
  const stack = opened.length > 0 && !gone ? opened : fallback;
  const shown = stack.at(-1);
  const heading = shown && title(shown);

  return (
    <View style={styles.root}>
      <SettingsPaneContext.Provider
        value={{ open: (link) => setOpened([link]), selected: stack[0] && linkKey(stack[0]) }}
      >
        <ScrollView
          {...scrollList}
          contentInsetAdjustmentBehavior="automatic"
          style={[styles.list, { borderRightColor: c.separator }]}
          contentContainerStyle={pageContent}
        >
          {children}
        </ScrollView>
      </SettingsPaneContext.Provider>
      <SettingsPaneContext.Provider value={{ open: (link) => setOpened([...stack, link]) }}>
        {shown && (
          <ScrollView
            // A new page starts at the top.
            key={stack.map(linkKey).join('/')}
            {...scrollList}
            contentInsetAdjustmentBehavior="automatic"
            style={styles.pane}
            contentContainerStyle={[pageContent, pageColumn]}
          >
            {(heading !== undefined || stack.length > 1) && (
              <View style={styles.heading}>
                {stack.length > 1 && (
                  <IconButton
                    icon={{ ios: 'chevron.left', android: 'arrow_back' }}
                    label={`Back to ${title(stack[stack.length - 2]) ?? 'Account'}`}
                    onPress={() => setOpened(stack.slice(0, -1))}
                  />
                )}
                {heading !== undefined && (
                  <Text variant="largeTitle" accessibilityRole="header" numberOfLines={1} style={styles.title}>
                    {heading}
                  </Text>
                )}
              </View>
            )}
            <PaneContent link={shown} />
          </ScrollView>
        )}
      </SettingsPaneContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  list: { width: LIST_WIDTH, flexGrow: 0, borderRightWidth: StyleSheet.hairlineWidth },
  pane: { flex: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flexShrink: 1 },
});
