// SPDX-License-Identifier: GPL-3.0-or-later
// Settings → Licences: Rillwood's licence, its native parts on this platform, then every npm package (~360 rows), as a
// virtualised list grouped like `ListSection`. It scrolls itself: the `/licences` screen and the tablet pane
// (`SettingsSplit`, its heading as `header`) both host it directly, never inside a ScrollView.
import { memo, useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import { licenceSections, type Licence } from '@/licences';
import { radii, scrollList, spacing, useColors } from '@/theme';

import { ListRow } from './List';
import { pageColumn, pageContent } from './Page';
import { useSettingsLink } from './SettingsLink';
import { Text } from './Text';

/** Credit for FFmpeg inside the player binaries (both platforms); changes with the LGPL rebuild (CLAUDE.md §7). */
const FFMPEG_CREDIT =
  'This app uses code of FFmpeg (ffmpeg.org) licensed under the GPL-3.0. Its source is at the links of the player libraries above.';

type Section = { key: string; title?: string; footer?: string; data: Licence[] };

type RowProps = { licence: Licence; first: boolean; last: boolean; onOpen: (id: number) => void };

/** One entry in its group's surface: rounded at the group's ends, a hairline under all but the last. */
const LicenceRow = memo(function LicenceRow({ licence, first, last, onOpen }: RowProps) {
  const c = useColors();
  return (
    <View
      style={[
        { backgroundColor: c.surface },
        first && styles.first,
        last ? styles.last : [styles.divider, { borderBottomColor: c.separator }],
      ]}
    >
      <ListRow label={licence.name} value={licence.licence} onPress={() => onOpen(licence.id)} />
    </View>
  );
});

/** `header`: drawn above the list, inside its scroll (the tablet pane's heading). */
export function LicencesList({ header }: { header?: ReactElement | false }) {
  const link = useSettingsLink();
  // The link's `open` changes with every render of the split view; the rows keep one handler (memo).
  const open = useRef(link.open);
  useEffect(() => {
    open.current = link.open;
  });
  const onOpen = useCallback((id: number) => open.current({ page: 'licence', id }), []);
  const sections = useMemo((): Section[] => {
    const { app, native, packages } = licenceSections();
    return [
      { key: 'app', data: [app] },
      { key: 'native', title: 'Native components', footer: FFMPEG_CREDIT, data: native },
      { key: 'packages', title: 'Packages', data: packages },
    ];
  }, []);
  return (
    <SectionList
      {...scrollList}
      contentInsetAdjustmentBehavior="automatic"
      sections={sections}
      keyExtractor={(l) => String(l.id)}
      initialNumToRender={20}
      ListHeaderComponent={header || undefined}
      ListHeaderComponentStyle={styles.header}
      contentContainerStyle={[styles.content, pageColumn]}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) =>
        section.title ? (
          <Text variant="caption" secondary accessibilityRole="header" style={styles.title}>
            {section.title.toUpperCase()}
          </Text>
        ) : null
      }
      renderSectionFooter={({ section }) => (
        <View style={styles.footer}>
          {section.footer && (
            <Text variant="caption" secondary style={styles.footerText}>
              {section.footer}
            </Text>
          )}
        </View>
      )}
      renderItem={({ item, index, section }) => (
        <LicenceRow licence={item} first={index === 0} last={index === section.data.length - 1} onOpen={onOpen} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  // A page's padding; blocks are spaced by the section footers (`gap` on a virtualised list spaces off-screen rows).
  content: { padding: pageContent.padding },
  header: { paddingBottom: spacing.lg },
  title: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  first: { borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card },
  last: { borderBottomLeftRadius: radii.card, borderBottomRightRadius: radii.card },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  footer: { paddingBottom: spacing.lg },
  footerText: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
