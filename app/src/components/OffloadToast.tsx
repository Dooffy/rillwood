// SPDX-License-Identifier: GPL-3.0-or-later
// Auto-remove (`src/offload.ts`) in a toast: what a cleanup took off the phone ("Removed 2 downloads - 3.4 GB freed."),
// and a download just watched to the end that Remove watched will take, with Keep (reached the end by accident).
import { useEffect } from 'react';

import { resetTimers } from '@/downloads';
import { formatBytes } from '@/format';
import { onOffload, onWatched, type OffloadResult } from '@/offload';
import { getOffloadDays, OFFLOAD_WATCHED } from '@/settings';

import { useToast } from './Toast';

export const offloadMessage = ({ count, bytes }: OffloadResult) =>
  `Removed ${count} ${count === 1 ? 'download' : 'downloads'} - ${formatBytes(bytes)} freed.`;

/** "Watched - removed in 24 hours." */
export const watchedMessage = (hours: number) =>
  `Watched - removed in ${OFFLOAD_WATCHED.find((o) => o.value === hours)?.label ?? `${hours} hours`}.`;

/** After Keep: "Kept for 90 more days." (Remove downloads Never: "Kept."). */
export const keptMessage = (days: number) => (days > 0 ? `Kept for ${days} more days.` : 'Kept.');

/** Render once inside `ToastProvider`. */
export function OffloadToast() {
  const toast = useToast();
  useEffect(() => onOffload((result) => toast(offloadMessage(result))), [toast]);
  useEffect(
    () =>
      onWatched(({ ids, hours }) =>
        toast(watchedMessage(hours), {
          label: 'Keep',
          onPress: () => {
            resetTimers(ids);
            toast(keptMessage(getOffloadDays()));
          },
        }),
      ),
    [toast],
  );
  return null;
}
