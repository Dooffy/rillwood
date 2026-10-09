// SPDX-License-Identifier: GPL-3.0-or-later
import { Stack } from 'expo-router';
import { useMemo } from 'react';

import type { BaseItemDto } from '@/api';
import { useCanDownload } from '@/useDownloadControl';

import { DownloadButton } from './DownloadButton';

/** Header buttons of a detail screen: Download on the right for `download` (a movie, an episode, a season). */
export function DetailHeader({ download, label }: { download?: BaseItemDto; label?: string }) {
  // No headerRight at all when it can't be downloaded: iOS draws an empty glass button for one that renders nothing.
  const available = useCanDownload(download);
  // Stable options: a new object on every screen render would update the native header each time. The button
  // re-renders itself on progress.
  const options = useMemo(
    () => ({
      headerRight: download && available ? () => <DownloadButton item={download} label={label} /> : undefined,
    }),
    [download, available, label],
  );
  return <Stack.Screen options={options} />;
}
