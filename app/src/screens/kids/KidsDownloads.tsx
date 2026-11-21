// SPDX-License-Identifier: GPL-3.0-or-later
// Kids downloads (docs/context/kids.md, Downloads; screen draft 10): a grown-up page inside kids mode, from the gate.
// Every show and movie the kid can see (kids Home's list: same filter and library), the ones on the phone first, then
// A-Z, narrowed by a search field. A movie's button is the app's download button; a show's opens a menu: Next 5
// Episodes, Whole Show or a season. The storage bar on top is the Downloads tab's.
import { router, Stack } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SectionList, StyleSheet, View } from 'react-native';

import { request, useOffline, type BaseItemDto, type ItemsResult, type UserDto } from '@/api';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { Artwork } from '@/components/Artwork';
import { DownloadButton, isWaiting } from '@/components/DownloadButton';
import { DownloadRing } from '@/components/DownloadRing';
import { IconButton } from '@/components/IconButton';
import { Empty, LoadError, Message, Offline } from '@/components/Message';
import { pageColumn, pageContent } from '@/components/Page';
import { SearchField } from '@/components/SearchField';
import { StorageBar, useFreeSpace } from '@/components/StorageBar';
import { Text } from '@/components/Text';
import { downloadList } from '@/downloadList';
import {
  deleteDownloads,
  downloadGroup,
  downloadsSize,
  pauseDownloads,
  resumeDownloads,
  useDownloadList,
  useDownloadSummary,
  type DownloadSummary,
} from '@/downloads';
import { formatBytes } from '@/format';
import { currentUser, itemDetail, posterImage, searchTerm, seasonFiles, seasons } from '@/items';
import { keptEpisodes } from '@/kidsKeep';
import { hiddenDownloads, kidsDownloadSections, NEXT_COUNT, playableEpisodes, showFiles } from '@/kidsDownloads';
import { isKept, keepShow, kidsFilter, setKids, stopKeeping, useKids } from '@/kidsSettings';
import { useSession } from '@/session';
import { getDownloadNetwork, useDownloadLimit, useDownloadNetwork, type DownloadNetwork } from '@/settings';
import { minTouch, radii, scrollList, spacing, useColors } from '@/theme';
import { confirmDeleteDownloads, useStartDownload } from '@/useDownloadControl';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';
import { refreshKids, useKidsHome } from '@/useKidsHome';

const POSTER_WIDTH = 44;

/** The download network rule in words, for the Keep question. */
const networkRule = () => (getDownloadNetwork() === 'wifi' ? 'on Wi-Fi' : 'on any network');

export function KidsDownloads() {
  const home = useKidsHome();
  const { active, accounts } = useSession();
  const kids = useKids(active?.id);
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
  // Offline the list is the downloads that pass the filter; the rest (an adult's on a shared phone) only counted.
  const hidden = useMemo(
    () => (home.downloaded ? hiddenDownloads(all, active?.id, kidsFilter(kids)) : null),
    [home.downloaded, kids, all, active?.id],
  );
  const hiddenLine = hidden && hidden.count > 0 ? hiddenText(hidden.count, hidden.bytes) : undefined;
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
      {!blocked && home.empty && home.downloaded && !hiddenLine && (
        <Empty
          icon={{ ios: 'arrow.down.circle', android: 'download' }}
          title="Nothing Downloaded"
          text="Shows and movies you download here play without the internet. Connect to download some."
        />
      )}
      {!blocked && home.empty && !home.downloaded && <Message text="Nothing to watch yet." />}
      {!blocked && term && home.titles.length > 0 && sections.length === 0 && <Message text="Nothing called that." />}
    </View>
  );

  // Delete All in the header: always there, dimmed until something of this account is downloaded.
  const ids = list.ids;
  const used = list.used;
  const headerOptions = useMemo(
    () => ({
      headerRight: () => (
        <IconButton
          variant="plain"
          icon={{ ios: 'trash', android: 'delete' }}
          label="Delete All Downloads"
          disabled={!active || ids.length === 0}
          onPress={() => active && confirmDeleteAll(active.id, active.userName, ids, used)}
        />
      ),
    }),
    [active, ids, used],
  );

  return (
    <>
      <Stack.Screen options={headerOptions} />
      <SectionList
        {...scrollList}
        testID="kids-downloads"
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        sections={blocked ? [] : sections}
        keyExtractor={(item) => item.Id}
        ListHeaderComponent={header}
        ListFooterComponent={
          hiddenLine && !blocked ? (
            <Text variant="caption" secondary style={styles.hidden}>
              {hiddenLine}
            </Text>
          ) : undefined
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[pageContent, pageColumn, styles.content]}
        renderSectionHeader={({ section }) => (
          <Text variant="caption" secondary accessibilityRole="header" style={styles.sectionTitle}>
            {section.title.toUpperCase()}
          </Text>
        )}
        renderItem={({ item }) => <TitleRow item={item} art={home.art.get(item.Id)} />}
      />
    </>
  );
}

/** The line under the list offline for the downloads the filter keeps out. */
export function hiddenText(count: number, bytes: number) {
  const one = count === 1;
  return `${one ? '1 download' : `${count} downloads`} not for Kids Mode (${formatBytes(bytes)}) ${one ? "isn't" : "aren't"} shown here. Delete All removes ${one ? 'it' : 'them'} too.`;
}

/**
 * Every download of the account goes, after asking (works offline - only the phone changes). Kept shows stop topping
 * up too, else the next sync would bring them back.
 */
export function confirmDeleteAll(accountId: string, userName: string, ids: readonly string[], bytes: number) {
  const count = ids.length === 1 ? '1 download' : `${ids.length} downloads`;
  Alert.alert(
    `Delete all of ${userName}'s downloads?`,
    `${count} (${formatBytes(bytes)}) are removed from this phone. Kept shows stop topping up. You can download them again.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: () => {
          deleteDownloads(ids);
          setKids(accountId, { kept: undefined });
        },
      },
    ],
  );
}

/** One show or movie: poster, name, what's on the phone, its download button. */
const TitleRow = memo(function TitleRow({ item, art }: { item: BaseItemDto; art?: string }) {
  const c = useColors();
  const image = useImage();
  const accountId = useSession().active?.id;
  const show = item.Type === 'Series';
  const group = accountId ? downloadGroup(accountId, show ? { seriesId: item.Id } : { itemId: item.Id }) : null;
  const summary = useDownloadSummary(group);
  // A movie not on the phone yet: its file size (the detail request, cached; only rows on screen ask).
  const detail = useFetch<BaseItemDto>(!show && !summary ? itemDetail(item.Id).path : null);
  const kept = isKept(useKids(accountId), show ? item.Id : undefined);
  const network = useDownloadNetwork();
  const status = statusLine(summary, show, item.RecursiveItemCount, detail.data?.MediaSources?.[0]?.Size, network);
  const line = kept ? [`Keeping ${NEXT_COUNT}`, status].filter(Boolean).join(' · ') : status;
  return (
    <View style={[styles.row, { backgroundColor: c.surface }]}>
      <View style={styles.poster}>
        <Artwork image={art ?? image(posterImage(item), POSTER_WIDTH)} aspectRatio={2 / 3} />
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
 * What of it is on the phone, in the Downloads tab's words. A show: "5/32 episodes · 1.4 GB" (on the phone / in the
 * show, when the server says how many), "0/32 episodes" before any; while it runs "Downloading 12% · 2 of 5", else
 * "Waiting for Wi-Fi · 2 of 5" / "Waiting · 2 of 5" / "Failed · 2 of 5" / "Paused · 2 of 5". A movie: its size
 * ("1.9 GB"), the same words while it's on the way, then "On this phone · 1.9 GB".
 */
export function statusLine(
  summary: DownloadSummary | null,
  show: boolean,
  episodes: number | undefined,
  /** A movie's file size before it's downloaded. */
  fileSize?: number,
  network: DownloadNetwork = 'wifi',
): string | undefined {
  if (summary && summary.state !== 'done') {
    const state =
      summary.running > 0
        ? `Downloading ${Math.floor(summary.progress * 100)}%`
        : summary.waitingForNetwork
          ? network === 'any'
            ? 'Waiting for network'
            : 'Waiting for Wi-Fi'
          : summary.failed > 0
            ? 'Failed'
            : summary.state === 'paused'
              ? 'Paused'
              : 'Waiting';
    return show ? `${state} · ${summary.done} of ${summary.ids.length}` : state;
  }
  const size = summary ? ` · ${formatBytes(summary.size)}` : '';
  if (!show) return summary ? `On this phone${size}` : fileSize ? formatBytes(fileSize) : undefined;
  const here = summary?.itemIds.length ?? 0;
  if (episodes) return `${here}/${episodes} episodes${size}`;
  return summary ? `${here} ${here === 1 ? 'episode' : 'episodes'}${size}` : undefined;
}

/**
 * A show's button: ↓, the ring while downloading, ✓ once there - each opens the menu: Keep Next 5 Episodes (asks
 * first; kept shows top up after each sync run - `src/kidsKeep.ts`) or Stop Keeping, Whole Show, each season (episodes
 * already here are skipped by the store), then Pause / Resume and Delete (which also stops keeping).
 */
function ShowDownload({ show, summary }: { show: BaseItemDto; summary: DownloadSummary | null }) {
  const c = useColors();
  const [menu, setMenu] = useState(false);
  const { start, starting } = useStartDownload();
  // The seasons, asked once the menu opens (cached after).
  const seasonList = useFetch<ItemsResult>(menu ? seasons(show.Id).path : null).data?.Items ?? [];
  const files = showFiles(show.Id);
  const accountId = useSession().active?.id;
  const kept = isKept(useKids(accountId), show.Id);
  const offline = useOffline();

  // Said plainly before it starts: what stays, what goes, when the next one comes.
  const keep = () =>
    Alert.alert(
      `Keep ${NEXT_COUNT} episodes of ${show.Name}?`,
      `Rillwood keeps the next ${NEXT_COUNT} episodes on this phone. An episode is removed a day after it's watched, and the next one downloads (${networkRule()}).`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Keep',
          onPress: () => {
            if (!accountId) return;
            keepShow(accountId, show.Id);
            start((conn) => keptEpisodes(conn, show.Id));
          },
        },
      ],
    );

  // Offline: only what works on the phone alone (Stop Keeping, Pause / Resume, Delete) - getting more needs the server.
  const stop = {
    label: 'Stop Keeping',
    detail: 'The episodes here stay',
    onPress: () => accountId && stopKeeping(accountId, show.Id),
  };
  const getMore: SheetAction[] = offline
    ? []
    : [
        ...(kept
          ? []
          : [{ label: `Keep Next ${NEXT_COUNT} Episodes`, detail: 'Swaps watched ones for new ones', onPress: keep }]),
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
      ];
  const actions: SheetAction[] = [
    ...(kept ? [stop] : []),
    ...getMore,
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
            // Deleting them all stops keeping the show too.
            onPress: () =>
              confirmDeleteDownloads(show.Name, summary.ids, () => accountId && stopKeeping(accountId, show.Id)),
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
        <DownloadRing
          progress={summary.progress}
          paused={summary.state === 'paused'}
          spinning={isWaiting(summary)}
          onPress={open}
        />
      )}
      <ActionSheet visible={menu} title={`Download ${show.Name}`} actions={actions} onClose={() => setMenu(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  hidden: { textAlign: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.md },
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
