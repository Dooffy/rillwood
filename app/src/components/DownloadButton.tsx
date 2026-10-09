// SPDX-License-Identifier: GPL-3.0-or-later
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import { minTouch, useColors } from '@/theme';
import { useDownloadControl } from '@/useDownloadControl';

import { DownloadRing } from './DownloadRing';
import { IconButton } from './IconButton';

/**
 * Header button of a detail screen for a movie, episode or season: ↓ downloads (a partly downloaded season: the
 * rest), a ring while downloading (tap pauses) or paused (tap resumes), ✓ once downloaded (tap asks to delete). Shown by `DetailHeader` only when
 * `useCanDownload`.
 */
export function DownloadButton({ item, label = 'Download' }: { item: BaseItemDto; label?: string }) {
  const c = useColors();
  const { summary, partial, starting, start, pause, resume, remove } = useDownloadControl(item);
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
  const paused = summary.state === 'paused';
  return (
    <View style={styles.box}>
      <DownloadRing progress={summary.progress} paused={paused} onPress={paused ? resume : pause} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
});
