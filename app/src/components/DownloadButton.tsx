// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import { minTouch, useColors } from '@/theme';
import { downloadActions, useDownloadControl, type DownloadControl } from '@/useDownloadControl';

import { ActionSheet } from './ActionSheet';
import { DownloadRing } from './DownloadRing';
import { IconButton } from './IconButton';

/**
 * Header button of a detail screen for a movie, episode or season: ↓ downloads (a partly downloaded season: the
 * rest), a ring while downloading or paused (tap: Pause / Resume + Cancel Download), ✓ once downloaded (tap asks to
 * delete). Shown by `DetailHeader` only when `useCanDownload`.
 */
export function DownloadButton({ item, label = 'Download' }: { item: BaseItemDto; label?: string }) {
  const c = useColors();
  const control = useDownloadControl(item);
  const { summary, partial, starting, start, remove } = control;
  if (starting) {
    return (
      <View style={styles.box}>
        <ActivityIndicator accessibilityLabel="Starting download" color={c.text} />
      </View>
    );
  }
  // A partial season not downloading: ↓ gets the rest (and resumes what's paused).
  if (!summary || (partial && summary.state !== 'downloading')) {
    return (
      <IconButton variant="plain" icon={{ ios: 'arrow.down', android: 'download' }} label={label} onPress={start} />
    );
  }
  if (summary.state === 'done') {
    return (
      <IconButton
        variant="plain"
        icon={{ ios: 'checkmark.circle', android: 'download_done' }}
        label="Downloaded, delete download"
        onPress={remove}
      />
    );
  }
  return <RingWithMenu name={item.Name} control={control} />;
}

/** The ring and its menu: the menu goes with the ring (done, deleted), so it never pops up again by itself. */
function RingWithMenu({ name, control }: { name: string; control: DownloadControl }) {
  const [menu, setMenu] = useState(false);
  const { summary } = control;
  if (!summary) return null;
  return (
    <View style={styles.box}>
      <DownloadRing progress={summary.progress} paused={summary.state === 'paused'} onPress={() => setMenu(true)} />
      <ActionSheet visible={menu} title={name} actions={downloadActions(control)} onClose={() => setMenu(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
