// SPDX-License-Identifier: GPL-3.0-or-later
// A show's downloaded episodes (from its row on the Downloads tab): by season, in episode order, the same rows as the
// tab (tap plays a ready one, ring while running, swipe left to delete). Leaves by itself once the last one is gone.
// A SectionList (a long-running show stays smooth), one section per season.
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { SectionList, StyleSheet, type SectionListRenderItem } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useDownloadActions } from '@/components/DownloadActions';
import { DOWNLOAD_ROW_GAP, DownloadRow, DownloadRowGap } from '@/components/DownloadRow';
import { pageContent } from '@/components/Page';
import { Message } from '@/components/Message';
import { Text } from '@/components/Text';
import { episodeCount, episodeTitle, showSeasons, type DownloadSeason } from '@/downloadList';
import { getDownload, useDownloadList } from '@/downloads';
import { formatBytes } from '@/format';
import { useSession } from '@/session';
import { scrollList } from '@/theme';

const idKey = (id: string) => id;

const seasonHeader = ({ section }: { section: DownloadSeason }) => (
  <Text variant="sectionHeader" accessibilityRole="header" style={styles.season}>
    {section.title}
  </Text>
);

export default function ShowDownloads() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { active } = useSession();
  const all = useDownloadList();
  const { seasons, ids, total } = useMemo(() => {
    const by = showSeasons(all, active?.id, id);
    const every = by.flatMap((s) => s.data);
    return { seasons: by, ids: every, total: every.reduce((sum, i) => sum + (getDownload(i)?.total ?? 0), 0) };
  }, [all, active?.id, id]);
  const { play, remove, openMenu, sheet } = useDownloadActions();
  const renderEpisode = useCallback<SectionListRenderItem<string, DownloadSeason>>(
    ({ item: i }) => {
      const d = getDownload(i);
      return (
        <DownloadRow id={i} title={d ? episodeTitle(d) : undefined} onPlay={play} onDelete={remove} onMenu={openMenu} />
      );
    },
    [play, remove, openMenu],
  );

  // The last episode deleted here: back to the tab (it's gone from there too).
  const had = useRef(false);
  useEffect(() => {
    if (ids.length > 0) had.current = true;
    else if (had.current) router.back();
  }, [ids.length]);

  if (ids.length === 0) return <Message fill text="Nothing downloaded from this show." />;
  return (
    <GestureHandlerRootView style={styles.root}>
      <SectionList
        {...scrollList}
        contentInsetAdjustmentBehavior="automatic"
        sections={seasons}
        // A row's title is read at render (numbers can arrive later): redraw rows when the store changes.
        extraData={all}
        keyExtractor={idKey}
        renderItem={renderEpisode}
        ItemSeparatorComponent={DownloadRowGap}
        renderSectionHeader={seasonHeader}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={<Text secondary>{`${episodeCount(ids.length)} · ${formatBytes(total)}`}</Text>}
        contentContainerStyle={styles.content}
      />
      {sheet}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // A page's padding; a season header a page's block gap below what's above it, a row gap above its first episode.
  content: { padding: pageContent.padding },
  season: { paddingTop: pageContent.gap, paddingBottom: DOWNLOAD_ROW_GAP },
});
