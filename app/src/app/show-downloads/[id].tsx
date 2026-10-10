// SPDX-License-Identifier: GPL-3.0-or-later
// A show's downloaded episodes (from its row on the Downloads tab): by season, in episode order, the same rows as the
// tab (tap plays a ready one, ring while running, swipe left to delete). Leaves by itself once the last one is gone.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useDownloadActions } from '@/components/DownloadActions';
import { DownloadRow } from '@/components/DownloadRow';
import { Message } from '@/components/Message';
import { Page } from '@/components/Page';
import { Text } from '@/components/Text';
import { episodeCount, episodeTitle, showSeasons } from '@/downloadList';
import { getDownload, useDownloadList } from '@/downloads';
import { formatBytes } from '@/format';
import { useSession } from '@/session';
import { spacing } from '@/theme';

export default function ShowDownloads() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { active } = useSession();
  const all = useDownloadList();
  const seasons = useMemo(() => showSeasons(all, active?.id, id), [all, active?.id, id]);
  const { play, remove, openMenu, sheet } = useDownloadActions();
  const ids = seasons.flatMap((s) => s.ids);
  const total = ids.reduce((sum, i) => sum + (getDownload(i)?.total ?? 0), 0);

  // The last episode deleted here: back to the tab (it's gone from there too).
  const had = useRef(false);
  useEffect(() => {
    if (ids.length > 0) had.current = true;
    else if (had.current) router.back();
  }, [ids.length]);

  if (ids.length === 0) return <Message fill text="Nothing downloaded from this show." />;
  return (
    <GestureHandlerRootView style={styles.root}>
      <Page>
        <Text secondary>{`${episodeCount(ids.length)} · ${formatBytes(total)}`}</Text>
        {seasons.map((s) => (
          <View key={s.title} style={styles.season}>
            <Text variant="sectionHeader" accessibilityRole="header">
              {s.title}
            </Text>
            {s.ids.map((i) => {
              const d = getDownload(i);
              return (
                <DownloadRow
                  key={i}
                  id={i}
                  title={d ? episodeTitle(d) : undefined}
                  onPlay={play}
                  onDelete={remove}
                  onMenu={openMenu}
                />
              );
            })}
          </View>
        ))}
      </Page>
      {sheet}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  season: { gap: spacing.sm + spacing.xs },
});
