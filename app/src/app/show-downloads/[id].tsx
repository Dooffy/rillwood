// SPDX-License-Identifier: GPL-3.0-or-later
// A show's downloaded episodes (from its row on the Downloads tab): the shared show header (poster, name, totals, a
// bar while it downloads, the next timer), season pills, then the season's episodes in order - the same rows as the
// tab (tap plays a ready one, ring while running, swipe left to delete). Header ⋯ = the row's long press (Reset
// Timers, Delete Downloads). Leaves by itself once the last one is gone. A FlatList (a long-running show stays smooth).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View, type ListRenderItem } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ActionSheet } from '@/components/ActionSheet';
import { Chip } from '@/components/Chip';
import { useDownloadActions } from '@/components/DownloadActions';
import {
  DownloadRow,
  DownloadRowGap,
  DownloadShowHeader,
  expiryLine,
  poster,
  useGroupExpiry,
} from '@/components/DownloadRow';
import { headerIconButton } from '@/components/IconButton';
import { Message } from '@/components/Message';
import { pageColumn, pageContent } from '@/components/Page';
import { episodeCount, episodeTitle, groupStatus, showSeasons, UNKNOWN_SHOW } from '@/downloadList';
import { downloadGroup, getDownload, useDownloadList, useDownloadSummary } from '@/downloads';
import { formatBytes } from '@/format';
import { useSession } from '@/session';
import { useDownloadNetwork, useOffloadDays, useOffloadWatched } from '@/settings';
import { scrollList, spacing } from '@/theme';
import { showDownloadActions } from '@/useDownloadControl';

const idKey = (id: string) => id;

export default function ShowDownloads() {
  const { id, name: linkName } = useLocalSearchParams<{ id: string; name?: string }>();
  const { active } = useSession();
  const all = useDownloadList();
  const { seasons, ids, total } = useMemo(() => {
    const by = showSeasons(all, active?.id, id);
    const every = by.flatMap((s) => s.data);
    return { seasons: by, ids: every, total: every.reduce((sum, i) => sum + (getDownload(i)?.total ?? 0), 0) };
  }, [all, active?.id, id]);
  const group = active ? downloadGroup(active.id, { seriesId: id }) : null;
  const summary = useDownloadSummary(group);
  const expires = useGroupExpiry(group);
  const network = useDownloadNetwork();
  const days = useOffloadDays();
  const hours = useOffloadWatched();
  const { play, remove, openMenu, sheet } = useDownloadActions();
  const [menu, setMenu] = useState(false);
  // One season at a time: the picked one (while it has episodes here), else the first.
  const [picked, setPicked] = useState<string>();
  const shown = seasons.find((s) => s.title === picked) ?? seasons[0];
  const first = ids[0] ? getDownload(ids[0]) : null;
  const name = linkName ?? first?.seriesName ?? UNKNOWN_SHOW;
  const renderEpisode = useCallback<ListRenderItem<string>>(
    ({ item: i }) => {
      const d = getDownload(i);
      return (
        <DownloadRow id={i} title={d ? episodeTitle(d) : undefined} onPlay={play} onDelete={remove} onMenu={openMenu} />
      );
    },
    [play, remove, openMenu],
  );
  const headerOptions = useMemo(
    () =>
      headerIconButton({
        icon: { ios: 'ellipsis', android: 'more_horiz' },
        label: 'More',
        onPress: () => setMenu(true),
      }),
    [],
  );

  // The last episode deleted here: back to the tab (it's gone from there too).
  const had = useRef(false);
  useEffect(() => {
    if (ids.length > 0) had.current = true;
    else if (had.current) router.back();
  }, [ids.length]);

  if (ids.length === 0) return <Message fill text="Nothing downloaded from this show." />;
  const running = summary && summary.state !== 'done' ? summary : null;
  const header = (
    <View style={styles.header}>
      <DownloadShowHeader
        image={poster(first)}
        name={name}
        totals={`${episodeCount(ids.length)} · ${formatBytes(total)}`}
        progress={running?.progress}
        progressLabel={running ? `${Math.floor(running.progress * 100)}% downloaded` : undefined}
        lines={[
          running && { text: `${groupStatus(running, network)} · ${running.done} of ${running.ids.length}` },
          !running && expiryLine(expires, true),
        ]}
      />
      {seasons.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {seasons.map((s) => (
            <Chip key={s.title} label={s.title} selected={s === shown} onPress={() => setPicked(s.title)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack.Screen options={headerOptions} />
      <FlatList
        {...scrollList}
        contentInsetAdjustmentBehavior="automatic"
        data={shown?.data ?? []}
        // A row's title is read at render (numbers can arrive later): redraw rows when the store changes.
        extraData={all}
        keyExtractor={idKey}
        renderItem={renderEpisode}
        ItemSeparatorComponent={DownloadRowGap}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
      />
      {sheet}
      <ActionSheet
        visible={menu}
        title={name}
        actions={menu ? showDownloadActions(name, ids, days, hours) : []}
        onClose={() => setMenu(false)}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // A page's padding (not its gap: rows get the row gap). Wide screens: a centred, readable column, like a `Page`.
  content: { padding: pageContent.padding, ...pageColumn },
  header: { gap: spacing.md, marginBottom: spacing.md },
  pills: { gap: spacing.sm, alignItems: 'center' },
});
