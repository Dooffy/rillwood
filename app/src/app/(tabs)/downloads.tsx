// SPDX-License-Identifier: GPL-3.0-or-later
// Downloads tab (docs/context/downloads.md, Downloads screen): the active account's downloads in one list, newest
// first - a row per movie, a row per show (opens its episodes), running ones with their ring. Swipe left to delete.
// Search (on the device) + All / Movies / Shows chips narrow the list; Episodes lists every episode on its own row.
// A FlatList (100+ shows stay smooth); it re-renders on structure only, each row reads its own progress. Tablets: two
// columns, search and chips on one line.
import { router } from 'expo-router';
import { getFreeDiskStorageAsync } from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { UserDto } from '@/api';
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { useDownloadActions } from '@/components/DownloadActions';
import { DownloadRow, DownloadRowGap, ShowDownloadRow, type ShowDownloadRowProps } from '@/components/DownloadRow';
import { Chip } from '@/components/Chip';
import { IconButton } from '@/components/IconButton';
import { Empty, Message } from '@/components/Message';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { StorageBar } from '@/components/StorageBar';
import { useTabContentWidth } from '@/components/TabsSidebar';
import {
  DOWNLOAD_SCOPES,
  downloadList,
  filterDownloads,
  type DownloadEntry,
  type DownloadQuery,
  type DownloadScope,
} from '@/downloadList';
import { deleteDownloads, downloadsSize, getDownload, resetTimers, useDownloadList } from '@/downloads';
import { formatBytes } from '@/format';
import { currentUser, searchTerm } from '@/items';
import { openLibrary } from '@/navigation';
import { expiresAt } from '@/offload';
import { useSession } from '@/session';
import { useDownloadLimit, useOffloadDays, useOffloadWatched } from '@/settings';
import { spacing, tabList, useWide } from '@/theme';
import { confirmDeleteDownloads } from '@/useDownloadControl';
import { useFetch } from '@/useFetch';

/**
 * Free space as the store's pre-flight reads it (purgeable included - `Paths.availableDiskSpace` leaves it out),
 * re-read when `key` changes. Unknown (the call failed) → undefined.
 */
function useFreeSpace(key: string): number | undefined {
  const [free, setFree] = useState<number>();
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const bytes = await getFreeDiskStorageAsync();
        if (live) setFree(bytes);
      } catch {
        if (live) setFree(undefined);
      }
    })();
    return () => {
      live = false;
    };
  }, [key]);
  return free;
}

type Show = ShowDownloadRowProps['show'];

/** Tablets: space between the two columns - rows have no card behind them, so wider than the row gap. */
const COLUMN_GAP = spacing.lg;

const entryKey = (e: DownloadEntry) => (e.kind === 'show' ? `show:${e.seriesId}` : e.id);

/** Asks, then starts the timers of these downloads again (auto-remove). */
function confirmResetTimers(name: string | undefined, ids: readonly string[], days: number) {
  const n = ids.length;
  Alert.alert(
    name ? `Reset the timers of ${name}?` : 'Reset all timers?',
    `${n} ${n === 1 ? 'download starts its' : 'downloads start their'} timer again now${days > 0 ? ` and ${n === 1 ? 'is' : 'are'} kept for ${days} more days` : ''}.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', onPress: () => resetTimers(ids) },
    ],
  );
}

/** What an empty list means (only ever narrowed: no downloads at all has its own message). */
function emptyText({ term, scope }: DownloadQuery): string {
  if (term) return `No downloads match "${term}".`;
  const label = DOWNLOAD_SCOPES.find((s) => s.key === scope)?.label ?? 'items';
  return `No ${label.toLowerCase()} downloaded.`;
}

export default function Downloads() {
  const { active, accounts } = useSession();
  const all = useDownloadList();
  const [text, setText] = useState('');
  const [scope, setScope] = useState<DownloadScope>('all');
  // Another account starts unnarrowed (the tab stays mounted across a switch).
  const [owner, setOwner] = useState(active?.id);
  if (owner !== active?.id) {
    setOwner(active?.id);
    setText('');
    setScope('all');
  }
  const term = searchTerm(text);
  const list = useMemo(() => downloadList(all, active?.id), [all, active?.id]);
  const { ids, used, storageKey } = list;
  // Narrowed on the device; the storage bar and Delete All stay over every download.
  const entries = useMemo(() => filterDownloads(list, { term, scope }), [list, term, scope]);
  const free = useFreeSpace(storageKey);
  const limit = useDownloadLimit();
  // The limit counts every account's downloads.
  const allSize = useMemo(() => downloadsSize(all), [all]);
  const { play, remove, openMenu, sheet } = useDownloadActions();
  // Nothing here yet: is the account allowed to download at all? Asked only then (unknown or offline → the usual text).
  const user = useFetch<UserDto>(ids.length === 0 && active ? currentUser.path : null);
  const blocked = user.data?.Policy?.EnableContentDownloading === false;
  const days = useOffloadDays();
  const hours = useOffloadWatched();
  // Header menu (everything) or a show's long press.
  const [menu, setMenu] = useState<{ show?: Show } | null>(null);
  /** The downloads of these ids auto-remove will take some day (Reset Timer). */
  const timed = (of: readonly string[]) =>
    of.filter((id) => {
      const d = getDownload(id);
      return !!d && expiresAt(d, days, hours) !== undefined;
    });

  const openShow = useCallback(
    (show: Show) => router.push({ pathname: '/show-downloads/[id]', params: { id: show.seriesId, name: show.name } }),
    [],
  );
  const removeShow = useCallback((show: Show) => confirmDeleteDownloads(show.name, show.ids), []);
  const showMenu = useCallback((show: Show) => setMenu({ show }), []);
  const accountId = active?.id ?? '';
  const wide = useWide();
  const columns = wide ? 2 : 1;
  // A fixed width, not flex: a lone last row stays one column wide.
  const tabWidth = useTabContentWidth();
  const cellWidth = wide ? Math.floor((tabWidth - 2 * spacing.md - COLUMN_GAP) / 2) : undefined;
  const renderEntry = useCallback<ListRenderItem<DownloadEntry>>(
    ({ item: e }) => (
      <View testID="download-cell" style={cellWidth !== undefined && { width: cellWidth }}>
        {e.kind === 'show' ? (
          <ShowDownloadRow accountId={accountId} show={e} onOpen={openShow} onDelete={removeShow} onMenu={showMenu} />
        ) : (
          <DownloadRow id={e.id} title={e.title} onPlay={play} onDelete={remove} onMenu={openMenu} />
        )}
      </View>
    ),
    [cellWidth, accountId, openShow, removeShow, showMenu, play, remove, openMenu],
  );

  // Everything of this account, running ones too.
  const removeAll = () =>
    Alert.alert(
      'Delete all downloads?',
      `${ids.length} ${ids.length === 1 ? 'download' : 'downloads'} (${formatBytes(used)}) are removed from this device. You can download them again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete All', style: 'destructive', onPress: () => deleteDownloads(ids) },
      ],
    );

  // A show's episodes, or (header) every download of the account.
  const menuIds = menu?.show ? menu.show.ids : ids;
  const resettable = menu ? timed(menuIds) : [];
  const menuActions: SheetAction[] = menu
    ? [
        ...(resettable.length > 0
          ? [
              {
                label: menu.show ? 'Reset Timers' : 'Reset All Timers',
                onPress: () => confirmResetTimers(menu.show?.name, resettable, days),
              },
            ]
          : []),
        menu.show
          ? { label: 'Delete Downloads', destructive: true, onPress: () => removeShow(menu.show!) }
          : { label: 'Delete All Downloads', destructive: true, onPress: removeAll },
      ]
    : [];

  return (
    <GestureHandlerRootView style={styles.root}>
      <Screen
        title="Downloads"
        right={
          ids.length > 0 && (
            <IconButton icon={{ ios: 'ellipsis', android: 'more_horiz' }} label="More" onPress={() => setMenu({})} />
          )
        }
      >
        {ids.length === 0 && active && blocked ? (
          <Empty
            icon={{ ios: 'exclamationmark', android: 'priority_high' }}
            title="Downloads Turned Off"
            text={`The admin of ${active.server.name} has turned off downloads for ${active.userName}, so nothing can be downloaded. You can still stream everything.`}
          />
        ) : ids.length === 0 || !active ? (
          <Empty
            icon={{ ios: 'arrow.down.circle', android: 'download' }}
            title="No Downloads Yet"
            text="Movies and episodes you download show up here and play without a connection."
            action={{ title: 'Browse Library', onPress: openLibrary }}
          />
        ) : (
          <>
            {/* Stay under the title while the list scrolls. */}
            <StorageBar
              used={used}
              all={allSize}
              free={free}
              limit={limit}
              shared={accounts.length > 1}
              onPress={() => router.push('/download-storage')}
            />
            <View style={[styles.controls, wide && styles.controlsWide]}>
              <View style={wide && styles.search}>
                <SearchField value={text} onChangeText={setText} placeholder="Search downloads" />
              </View>
              <View style={styles.scopes}>
                {DOWNLOAD_SCOPES.map((s) => (
                  <Chip key={s.key} label={s.label} selected={scope === s.key} onPress={() => setScope(s.key)} />
                ))}
              </View>
            </View>
            <FlatList
              {...tabList}
              // numColumns can't change on a mounted list: crossing the wide width (Split View) remounts it, back at the
              // top. Rotating an iPad doesn't (two columns either way).
              key={columns}
              numColumns={columns}
              columnWrapperStyle={wide ? styles.columns : undefined}
              data={entries}
              keyExtractor={entryKey}
              renderItem={renderEntry}
              ItemSeparatorComponent={DownloadRowGap}
              ListEmptyComponent={<Message text={emptyText({ term, scope })} />}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
            />
          </>
        )}
        {sheet}
        <ActionSheet
          visible={menu !== null}
          title={menu?.show?.name}
          actions={menuActions}
          onClose={() => setMenu(null)}
        />
      </Screen>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { gap: spacing.sm },
  controlsWide: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  search: { flex: 1 },
  // Wraps at large text sizes.
  scopes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  columns: { gap: COLUMN_GAP },
  list: { paddingTop: spacing.sm, paddingBottom: spacing.md },
});
