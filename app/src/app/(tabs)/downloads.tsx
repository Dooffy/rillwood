// SPDX-License-Identifier: GPL-3.0-or-later
// Downloads tab (docs/context/downloads.md, Downloads screen): the active account's downloads in one list, newest
// first - a row per movie, a row per show (opens its episodes), running ones with their ring. Swipe left to delete.
// Search (on the device) + All / Movies / Shows chips narrow the list; Episodes lists every episode on its own row.
// A FlatList (100+ shows stay smooth); it re-renders on structure only, each row reads its own progress.
import { router } from 'expo-router';
import { getFreeDiskStorageAsync } from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { useDownloadActions } from '@/components/DownloadActions';
import { DownloadRow, DownloadRowGap, ShowDownloadRow, type ShowDownloadRowProps } from '@/components/DownloadRow';
import { Chip } from '@/components/Chip';
import { IconButton } from '@/components/IconButton';
import { Message } from '@/components/Message';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { StorageBar } from '@/components/StorageBar';
import {
  DOWNLOAD_SCOPES,
  downloadList,
  filterDownloads,
  type DownloadEntry,
  type DownloadQuery,
  type DownloadScope,
} from '@/downloadList';
import { deleteDownloads, getDownload, resetTimers, useDownloadList } from '@/downloads';
import { formatBytes } from '@/format';
import { searchTerm } from '@/items';
import { expiresAt } from '@/offload';
import { useSession } from '@/session';
import { useOffloadDays, useOffloadWatched } from '@/settings';
import { spacing, tabList } from '@/theme';
import { confirmDeleteDownloads } from '@/useDownloadControl';

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

const entryKey = (e: DownloadEntry) => (e.kind === 'show' ? `show:${e.seriesId}` : e.id);

/** What an empty list means (only ever narrowed: no downloads at all has its own message). */
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

function emptyText({ term, scope }: DownloadQuery): string {
  if (term) return `No downloads match "${term}".`;
  const label = DOWNLOAD_SCOPES.find((s) => s.key === scope)?.label ?? 'items';
  return `No ${label.toLowerCase()} downloaded.`;
}

export default function Downloads() {
  const { active } = useSession();
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
  const { play, remove, openMenu, sheet } = useDownloadActions();
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
  const renderEntry = useCallback<ListRenderItem<DownloadEntry>>(
    ({ item: e }) =>
      e.kind === 'show' ? (
        <ShowDownloadRow accountId={accountId} show={e} onOpen={openShow} onDelete={removeShow} onMenu={showMenu} />
      ) : (
        <DownloadRow id={e.id} title={e.title} onPlay={play} onDelete={remove} onMenu={openMenu} />
      ),
    [accountId, openShow, removeShow, showMenu, play, remove, openMenu],
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
        {ids.length === 0 || !active ? (
          <Message text="Nothing downloaded yet. Download movies and episodes from their page to keep them on this device." />
        ) : (
          <>
            {/* Stay under the title while the list scrolls. */}
            <StorageBar used={used} free={free} />
            <View style={styles.controls}>
              <SearchField value={text} onChangeText={setText} placeholder="Search downloads" />
              <View style={styles.scopes}>
                {DOWNLOAD_SCOPES.map((s) => (
                  <Chip key={s.key} label={s.label} selected={scope === s.key} onPress={() => setScope(s.key)} />
                ))}
              </View>
            </View>
            <FlatList
              {...tabList}
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
  scopes: { flexDirection: 'row', gap: spacing.sm },
  list: { paddingTop: spacing.sm, paddingBottom: spacing.md },
});
