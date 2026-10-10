// SPDX-License-Identifier: GPL-3.0-or-later
// Downloads tab (docs/context/downloads.md, Downloads screen): the active account's downloads in one list, newest
// first - a row per movie, a row per show (opens its episodes), running ones with their ring. Swipe left to delete.
// Search (on the device) + All / Movies / Shows chips narrow the list.
// The list re-renders on structure only; each row reads its own progress.
import { router } from 'expo-router';
import { getFreeDiskStorageAsync } from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useDownloadActions } from '@/components/DownloadActions';
import { DownloadRow, ShowDownloadRow, type ShowDownloadRowProps } from '@/components/DownloadRow';
import { Chip } from '@/components/Chip';
import { IconButton } from '@/components/IconButton';
import { Message } from '@/components/Message';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { StorageBar } from '@/components/StorageBar';
import { DOWNLOAD_SCOPES, downloadList, filterDownloads, type DownloadQuery, type DownloadScope } from '@/downloadList';
import { deleteDownloads, useDownloadList } from '@/downloads';
import { formatBytes } from '@/format';
import { searchTerm } from '@/items';
import { useSession } from '@/session';
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

/** What an empty list means (only ever narrowed: no downloads at all has its own message). */
function emptyText({ term, scope }: DownloadQuery): string {
  if (term) return `No downloads match "${term}".`;
  return scope === 'shows' ? 'No shows downloaded.' : 'No movies downloaded.';
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

  const openShow = useCallback(
    (show: Show) => router.push({ pathname: '/show-downloads/[id]', params: { id: show.seriesId, name: show.name } }),
    [],
  );
  const removeShow = useCallback((show: Show) => confirmDeleteDownloads(show.name, show.ids), []);

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

  return (
    <GestureHandlerRootView style={styles.root}>
      <Screen
        title="Downloads"
        right={
          ids.length > 0 && (
            <IconButton icon={{ ios: 'trash', android: 'delete' }} label="Delete All Downloads" onPress={removeAll} />
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
            <ScrollView
              {...tabList}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
            >
              {entries.length === 0 && <Message text={emptyText({ term, scope })} />}
              {entries.map((e) =>
                e.kind === 'show' ? (
                  <ShowDownloadRow
                    key={e.seriesId}
                    accountId={active.id}
                    show={e}
                    onOpen={openShow}
                    onDelete={removeShow}
                  />
                ) : (
                  <DownloadRow key={e.id} id={e.id} onPlay={play} onDelete={remove} onMenu={openMenu} />
                ),
              )}
            </ScrollView>
          </>
        )}
        {sheet}
      </Screen>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { gap: spacing.sm },
  scopes: { flexDirection: 'row', gap: spacing.sm },
  list: { gap: spacing.sm + spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.md },
});
