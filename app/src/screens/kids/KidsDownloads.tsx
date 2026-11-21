// SPDX-License-Identifier: GPL-3.0-or-later
// Kids downloads (docs/context/kids.md, Downloads; screen draft 10): a grown-up page inside kids mode, from the gate.
// Every show and movie the kid can see (kids Home's list: same filter and library), the ones on the phone first, then
// A-Z, narrowed by a search field. A movie's button is the app's download button; a show's opens a menu: Next 5
// Episodes, Whole Show or a season. The storage bar on top is the Downloads tab's.
import { router } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';

import { request, type BaseItemDto, type ItemsResult, type UserDto } from '@/api';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { Artwork } from '@/components/Artwork';
import { DownloadButton } from '@/components/DownloadButton';
import { DownloadRing } from '@/components/DownloadRing';
import { IconButton } from '@/components/IconButton';
import { Empty, LoadError, Message, Offline } from '@/components/Message';
import { pageColumn, pageContent } from '@/components/Page';
import { SearchField } from '@/components/SearchField';
import { StorageBar, useFreeSpace } from '@/components/StorageBar';
import { Text } from '@/components/Text';
import { downloadList } from '@/downloadList';
import {
  downloadGroup,
  downloadsSize,
  pauseDownloads,
  resumeDownloads,
  useDownloadList,
  useDownloadSummary,
  type DownloadSummary,
} from '@/downloads';
import { formatBytes } from '@/format';
import { currentUser, itemDetail, posterImage, searchTerm, seasonFiles, seasons, seriesNextUp } from '@/items';
import { episodesToKeep, kidsDownloadSections, NEXT_COUNT, playableEpisodes, showFiles } from '@/kidsDownloads';
import { useSession } from '@/session';
import { useDownloadLimit } from '@/settings';
import { minTouch, radii, scrollList, spacing, useColors } from '@/theme';
import { confirmDeleteDownloads, useStartDownload } from '@/useDownloadControl';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';
import { refreshKids, useKidsHome } from '@/useKidsHome';

const POSTER_WIDTH = 44;

export function KidsDownloads() {
  const home = useKidsHome();
  const { active, accounts } = useSession();
  const all = useDownloadList();
  const [text, setText] = useState('');
  const term = searchTerm(text);
  const list = useMemo(() => downloadList(all, active?.id), [all, active?.id]);
  // Movies and shows with something of theirs on the phone (an episode counts for its show).
  const onPhone = useMemo(
    () =>
      new Set(
        all
          .filter((d) => d.accountId === active?.id)
          .flatMap((d) => (d.seriesId ? [d.itemId, d.seriesId] : [d.itemId])),
      ),
    [all, active?.id],
  );
  const { shows, movies } = useMemo(
    () => kidsDownloadSections(home.titles, onPhone, term),
    [home.titles, onPhone, term],
  );
  const free = useFreeSpace(list.storageKey);
  const limit = useDownloadLimit();
  const allSize = useMemo(() => downloadsSize(all), [all]);
  // The server's "Allow downloads" for this user (unknown or offline: the page as usual).
  const user = useFetch<UserDto>(active ? currentUser.path : null);
  const blocked = user.data?.Policy?.EnableContentDownloading === false;
  const c = useColors();

  const sections = [
    { title: 'Shows', data: shows },
    { title: 'Movies', data: movies },
  ].filter((s) => s.data.length > 0);

  const header = (
    <View style={styles.header}>
      {blocked && active ? (
        <Empty
          icon={{ ios: 'exclamationmark', android: 'priority_high' }}
          title="Downloads Turned Off"
          text={`The admin of ${active.server.name} has turned off downloads for ${active.userName}. Turn on "Allow downloads" for this user on the server.`}
        />
      ) : (
        <StorageBar
          used={list.used}
          all={allSize}
          free={free}
          limit={limit}
          shared={accounts.length > 1}
          onPress={() => router.push('/download-storage')}
        />
      )}
      {!blocked && <SearchField value={text} onChangeText={setText} placeholder="Find a show or movie" />}
      {home.offline.offline && <Offline busy={home.offline.busy} retry={refreshKids} />}
      {home.error && <LoadError error={home.error} retry={refreshKids} />}
      {home.loading && home.titles.length === 0 && <ActivityIndicator color={c.text} />}
      {!blocked && term && home.titles.length > 0 && sections.length === 0 && <Message text="Nothing called that." />}
    </View>
  );

  return (
    <SectionList
      {...scrollList}
      testID="kids-downloads"
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      sections={blocked ? [] : sections}
      keyExtractor={(item) => item.Id}
      ListHeaderComponent={header}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={[pageContent, pageColumn, styles.content]}
      renderSectionHeader={({ section }) => (
        <Text variant="caption" secondary accessibilityRole="header" style={styles.sectionTitle}>
          {section.title.toUpperCase()}
        </Text>
      )}
      renderItem={({ item }) => <TitleRow item={item} />}
    />
  );
}

/** One show or movie: poster, name, what's on the phone, its download button. */
const TitleRow = memo(function TitleRow({ item }: { item: BaseItemDto }) {
  const c = useColors();
  const image = useImage();
  const accountId = useSession().active?.id;
  const show = item.Type === 'Series';
  const group = accountId ? downloadGroup(accountId, show ? { seriesId: item.Id } : { itemId: item.Id }) : null;
  const summary = useDownloadSummary(group);
  // A movie not on the phone yet: its file size (the detail request, cached; only rows on screen ask).
  const detail = useFetch<BaseItemDto>(!show && !summary ? itemDetail(item.Id).path : null);
  const line = statusLine(summary, show, item.RecursiveItemCount, detail.data?.MediaSources?.[0]?.Size);
  return (
    <View style={[styles.row, { backgroundColor: c.surface }]}>
      <View style={styles.poster}>
        <Artwork image={image(posterImage(item), POSTER_WIDTH)} aspectRatio={2 / 3} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={2}>{item.Name}</Text>
        {line && (
          <Text variant="caption" secondary numberOfLines={1}>
            {line}
          </Text>
        )}
      </View>
      {show ? <ShowDownload show={item} summary={summary} /> : <DownloadButton item={item} round />}
    </View>
  );
});

/**
 * What of it is on the phone. A show: "5/32 episodes · 1.4 GB" (on the phone / in the show, when the server says how
 * many), "0/32 episodes" before any; while it downloads "Downloading 2 of 5". A movie: its size ("1.9 GB"), then
 * "On this phone · 1.9 GB".
 */
export function statusLine(
  summary: DownloadSummary | null,
  show: boolean,
  episodes: number | undefined,
  /** A movie's file size before it's downloaded. */
  fileSize?: number,
): string | undefined {
  const size = summary ? ` · ${formatBytes(summary.size)}` : '';
  if (!show) {
    if (!summary) return fileSize ? formatBytes(fileSize) : undefined;
    if (summary.state === 'downloading') return 'Downloading';
    if (summary.state === 'paused') return 'Paused';
    return `On this phone${size}`;
  }
  if (summary && summary.state !== 'done') {
    const word = summary.state === 'downloading' ? 'Downloading' : 'Paused';
    return `${word} ${summary.done} of ${summary.ids.length}`;
  }
  const here = summary?.itemIds.length ?? 0;
  if (episodes) return `${here}/${episodes} episodes${size}`;
  return summary ? `${here} ${here === 1 ? 'episode' : 'episodes'}${size}` : undefined;
}

/**
 * A show's button: ↓, the ring while downloading, ✓ once there - each opens the menu: Next 5 Episodes, Whole Show, each
 * season (episodes already here are skipped by the store), then Pause / Resume and Delete for what's here.
 */
function ShowDownload({ show, summary }: { show: BaseItemDto; summary: DownloadSummary | null }) {
  const c = useColors();
  const [menu, setMenu] = useState(false);
  const { start, starting } = useStartDownload();
  // The seasons, asked once the menu opens (cached after).
  const seasonList = useFetch<ItemsResult>(menu ? seasons(show.Id).path : null).data?.Items ?? [];
  const files = showFiles(show.Id);
  const next = seriesNextUp(show.Id);

  const actions: SheetAction[] = [
    {
      label: `Next ${NEXT_COUNT} Episodes`,
      detail: 'From where the kid is',
      onPress: () =>
        start(async (conn) => {
          const [all, up] = await Promise.all([
            request<ItemsResult>(conn, files.path, { query: files.query }),
            request<ItemsResult>(conn, next.path, { query: next.query }),
          ]);
          return episodesToKeep(all.Items, up.Items[0]?.Id);
        }),
    },
    {
      label: 'Whole Show',
      onPress: () =>
        start(async (conn) =>
          playableEpisodes((await request<ItemsResult>(conn, files.path, { query: files.query })).Items),
        ),
    },
    ...seasonList
      .filter((s) => (s.IndexNumber ?? 1) > 0)
      .map((s) => ({
        label: s.Name ?? `Season ${s.IndexNumber}`,
        detail: s.ChildCount ? `${s.ChildCount} ${s.ChildCount === 1 ? 'episode' : 'episodes'}` : undefined,
        onPress: () =>
          start(async (conn) => {
            const { path, query } = seasonFiles(show.Id, s.Id);
            return (await request<ItemsResult>(conn, path, { query })).Items;
          }),
      })),
    ...(summary
      ? [
          summary.state === 'downloading'
            ? { label: 'Pause Download', onPress: () => pauseDownloads(summary.ids) }
            : summary.state === 'paused'
              ? { label: 'Resume Download', onPress: () => resumeDownloads(summary.ids) }
              : null,
          {
            label: 'Delete Downloads',
            destructive: true,
            onPress: () => confirmDeleteDownloads(show.Name, summary.ids),
          },
        ].filter((a): a is SheetAction => a !== null)
      : []),
  ];

  const open = () => setMenu(true);
  return (
    <View style={styles.button}>
      {starting ? (
        <ActivityIndicator accessibilityLabel="Starting download" color={c.text} />
      ) : !summary ? (
        <IconButton
          variant="secondary"
          icon={{ ios: 'arrow.down', android: 'download' }}
          label="Download"
          onPress={open}
        />
      ) : summary.state === 'done' ? (
        <IconButton
          variant="secondary"
          icon={{ ios: 'checkmark', android: 'download_done' }}
          label="Downloaded, more"
          onPress={open}
        />
      ) : (
        <DownloadRing progress={summary.progress} paused={summary.state === 'paused'} onPress={open} />
      )}
      <ActionSheet visible={menu} title={`Download ${show.Name}`} actions={actions} onClose={() => setMenu(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.card,
  },
  poster: { width: POSTER_WIDTH },
  text: { flex: 1, gap: 2 },
  button: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
