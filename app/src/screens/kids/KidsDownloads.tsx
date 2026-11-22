// SPDX-License-Identifier: GPL-3.0-or-later
// Kids downloads (docs/context/kids.md, Downloads; screen draft 10): a grown-up page inside kids mode, from the gate.
// Every show and movie the kid can see (kids Home's list: same filter and library), the ones on the phone first, then
// A-Z, narrowed by a search field. A movie's button is the app's download button; a show's opens a menu: Next 5
// Episodes, Whole Show or a season. The Downloads tab's look (draft docs/research/downloads-parity.html): its storage
// bar, row frame, 20/700 section headers, ⋯ (Reset All Timers, Delete All Downloads) - its own flow.
import { router, Stack } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SectionList, StyleSheet, View } from 'react-native';

import { request, useOffline, type BaseItemDto, type ItemsResult, type UserDto } from '@/api';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { DownloadButton, isWaiting } from '@/components/DownloadButton';
import { DownloadRing } from '@/components/DownloadRing';
import {
  DOWNLOAD_ROW_GAP,
  downloadArtWidth,
  DownloadRowFrame,
  DownloadRowGap,
  expiryLine,
  useGroupExpiry,
  type RowLine,
} from '@/components/DownloadRow';
import { headerIconButton, IconButton } from '@/components/IconButton';
import { Empty, LoadError, Message, Offline } from '@/components/Message';
import { pageColumn, pageContent } from '@/components/Page';
import { SearchField } from '@/components/SearchField';
import { StorageBar, useFreeSpace } from '@/components/StorageBar';
import { Text } from '@/components/Text';
import { bytesOf, downloadList, episodeCount, groupStatus } from '@/downloadList';
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
import {
  getDownloadNetwork,
  useDownloadLimit,
  useDownloadNetwork,
  useOffloadDays,
  useOffloadWatched,
  type DownloadNetwork,
} from '@/settings';
import { scrollList, spacing, useColors, useWide } from '@/theme';
import { confirmDeleteDownloads, resetTimersAction, useStartDownload } from '@/useDownloadControl';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';
import { refreshKids, useKidsHome } from '@/useKidsHome';

/** A kept show's line on its row and page: green. */
export const KEPT_LINE: RowLine = { text: `Keeping the next ${NEXT_COUNT}`, tone: 'success' };

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

  // The header ⋯: Reset All Timers (with a timer) + Delete All Downloads. Always there, dimmed until something of this
  // account is downloaded.
  const ids = list.ids;
  const used = list.used;
  const days = useOffloadDays();
  const hours = useOffloadWatched();
  const [menu, setMenu] = useState(false);
  const headerOptions = useMemo(
    () =>
      headerIconButton({
        icon: { ios: 'ellipsis', android: 'more_horiz' },
        label: 'More',
        disabled: !active || ids.length === 0,
        onPress: () => setMenu(true),
      }),
    [active, ids.length],
  );
  const menuActions: SheetAction[] =
    menu && active
      ? [
          ...resetTimersAction(undefined, ids, days, hours),
          {
            label: 'Delete All Downloads',
            destructive: true,
            onPress: () => confirmDeleteAll(active.id, active.userName, ids, used),
          },
        ]
      : [];

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
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={DownloadRowGap}
        renderSectionHeader={({ section }) => (
          <Text variant="sectionHeader" accessibilityRole="header" style={styles.sectionTitle}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => <TitleRow item={item} art={home.art.get(item.Id)} />}
      />
      <ActionSheet visible={menu} actions={menuActions} onClose={() => setMenu(false)} />
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

/**
 * One show or movie on the shared row frame: poster, name, what's on the phone, its timer, kept (green), its download
 * button in the slot; a show's poster + name and › open its episodes.
 */
const TitleRow = memo(function TitleRow({ item, art }: { item: BaseItemDto; art?: string }) {
  const image = useImage();
  const wide = useWide();
  const accountId = useSession().active?.id;
  const show = item.Type === 'Series';
  const group = accountId ? downloadGroup(accountId, show ? { seriesId: item.Id } : { itemId: item.Id }) : null;
  const summary = useDownloadSummary(group);
  const expires = useGroupExpiry(group);
  // A movie not on the phone yet: its file size (the detail request, cached; only rows on screen ask).
  const detail = useFetch<BaseItemDto>(!show && !summary ? itemDetail(item.Id).path : null);
  const kept = isKept(useKids(accountId), show ? item.Id : undefined);
  const network = useDownloadNetwork();
  const status = statusLine(summary, show, item.RecursiveItemCount, detail.data?.MediaSources?.[0]?.Size, network);
  const name = item.Name ?? '';
  const lines = [status !== undefined && { text: status }, expiryLine(expires, show), kept && KEPT_LINE];
  const poster = art ?? image(posterImage(item), downloadArtWidth(false, wide));
  if (!show)
    return <DownloadRowFrame image={poster} title={name} lines={lines} slot={<DownloadButton item={item} round />} />;
  return (
    <DownloadRowFrame
      image={poster}
      title={name}
      lines={lines}
      chevron
      onPress={() => router.push({ pathname: '/kids-show-downloads/[id]', params: { id: item.Id } })}
      accessibilityLabel={`${name}, episodes`}
      slot={<ShowDownload show={item} summary={summary} />}
    />
  );
});

/**
 * What of it is on the phone, in the Downloads tab's words. A show: "5 of 32 episodes · 1.4 GB" (on the phone / in the
 * show, when the server says how many), "32 episodes" before any; while it runs "Downloading 12% · 2 of 5", else
 * "Waiting for Wi-Fi · 2 of 5" / "Waiting · 2 of 5" / "Failed · 2 of 5" / "Paused · 2 of 5". A movie (an episode): its
 * size ("1.9 GB") before and after, "Downloading 12% · 0.2 of 1.9 GB" on the way.
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
    const state = groupStatus(summary, network);
    return show
      ? `${state} · ${summary.done} of ${summary.ids.length}`
      : `${state} · ${bytesOf(summary.progress * summary.size, summary.size)}`;
  }
  if (!show) return summary ? formatBytes(summary.size) : fileSize ? formatBytes(fileSize) : undefined;
  const here = summary?.itemIds.length ?? 0;
  const size = summary ? ` · ${formatBytes(summary.size)}` : '';
  if (episodes) return summary ? `${here} of ${episodes} episodes${size}` : episodeCount(episodes);
  return summary ? `${episodeCount(here)}${size}` : undefined;
}

/**
 * A show's download menu (its row's button, the show's episodes page ⋯): Keep Next 5 Episodes (asks first; kept shows
 * top up after each sync run - `src/kidsKeep.ts`) or Stop Keeping, Whole Show, each season (episodes already here are
 * skipped by the store), then Pause / Resume and Delete (which also stops keeping).
 */
export function useShowMenu(show: BaseItemDto, summary: DownloadSummary | null) {
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

  const sheet = (
    <ActionSheet visible={menu} title={`Download ${show.Name}`} actions={actions} onClose={() => setMenu(false)} />
  );
  return { open: () => setMenu(true), starting, sheet };
}

/** A show's button: ↓, the ring while downloading, ✓ once there - each opens its menu (`useShowMenu`). */
function ShowDownload({ show, summary }: { show: BaseItemDto; summary: DownloadSummary | null }) {
  const c = useColors();
  const { open, starting, sheet } = useShowMenu(show, summary);
  return (
    <>
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
      {sheet}
    </>
  );
}

const styles = StyleSheet.create({
  // A page's padding (not its gap: rows get the row gap, as on the Downloads tab).
  content: { padding: pageContent.padding, ...pageColumn },
  header: { gap: spacing.md },
  // A section header a page's block gap below what's above it, a row gap above its first row.
  sectionTitle: { paddingTop: pageContent.gap, paddingBottom: DOWNLOAD_ROW_GAP },
  hidden: { textAlign: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.md },
});
