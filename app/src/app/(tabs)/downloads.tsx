// SPDX-License-Identifier: GPL-3.0-or-later
// Downloads tab (docs/context/downloads.md, Downloads screen): the active account's downloads in one list, newest
// first - a row per movie, a row per show (opens its episodes), running ones with their ring. Swipe left to delete.
// The list re-renders on structure only; each row reads its own progress.
import { router } from 'expo-router';
import { getFreeDiskStorageAsync } from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useDownloadActions } from '@/components/DownloadActions';
import { DownloadRow, ShowDownloadRow, type ShowDownloadRowProps } from '@/components/DownloadRow';
import { IconButton } from '@/components/IconButton';
import { Message } from '@/components/Message';
import { Screen } from '@/components/Screen';
import { StorageBar } from '@/components/StorageBar';
import { downloadList } from '@/downloadList';
import { deleteDownloads, useDownloadList } from '@/downloads';
import { formatBytes } from '@/format';
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

export default function Downloads() {
  const { active } = useSession();
  const all = useDownloadList();
  const { entries, used, storageKey } = useMemo(() => downloadList(all, active?.id), [all, active?.id]);
  const free = useFreeSpace(storageKey);
  const { play, remove, openMenu, sheet } = useDownloadActions();
  const ids = entries.flatMap((e) => (e.kind === 'show' ? e.ids : [e.id]));

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
            {/* Stays under the title while the list scrolls. */}
            <StorageBar used={used} free={free} />
            <ScrollView {...tabList} contentContainerStyle={styles.list}>
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
  list: { gap: spacing.sm + spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.md },
});
