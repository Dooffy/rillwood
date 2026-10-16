// SPDX-License-Identifier: GPL-3.0-or-later
import { Pressable, StyleSheet } from 'react-native';

import { formatBytes } from '@/format';
import { limitBytes } from '@/settings';
import { pressedOpacity, spacing } from '@/theme';

import { ProgressBar } from './ProgressBar';
import { Text } from './Text';

export type Storage = {
  /** Bytes of the account's downloads. */
  used: number;
  /** Bytes of every account's downloads (the limit counts them all). */
  all: number;
  /** Free space on the device; undefined = not read yet / unknown. */
  free?: number;
  /** Storage limit in decimal GB, 0 = none (Settings). */
  limit: number;
  /** More than one account on the phone: the limit's total says it counts them all. */
  shared?: boolean;
};

/**
 * What the bar says and fills (pure). No limit: the account's downloads vs free space. With a limit (phone-wide):
 * every account's downloads of the limit, free = what's left under it or on the device, whichever is less; the bar
 * fills against downloads + that free. Several accounts: "15 GB all accounts of 50 GB".
 */
export function storageSummary({ used, all, free, limit, shared }: Storage): {
  text: string;
  progress?: number;
  over: boolean;
} {
  if (limit <= 0) {
    return {
      text: `Downloads ${formatBytes(used)}${free === undefined ? '' : ` · ${formatBytes(free)} free`}`,
      progress: free === undefined ? undefined : used / (used + free || 1),
      over: false,
    };
  }
  const cap = limitBytes(limit);
  const over = all > cap;
  const room = Math.max(0, cap - all);
  const left = free === undefined ? room : Math.min(room, free);
  return {
    text: `Downloads ${formatBytes(all)}${shared ? ' all accounts' : ''} of ${formatBytes(cap)} · ${over ? 'over the limit' : `${formatBytes(left)} free`}`,
    // Against the room actually reachable: a 50 GB limit with 10 GB left on the phone fills like 10 GB would.
    progress: over ? 1 : all / (all + left || 1),
    over,
  };
}

/** Downloads vs free space, or vs the storage limit when one is set (Downloads tab). Tap: Settings → Storage limit. */
export function StorageBar({ onPress, ...storage }: Storage & { onPress: () => void }) {
  const { text, progress, over } = storageSummary(storage);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint="Opens the storage limit"
      onPress={onPress}
      style={({ pressed }) => [styles.box, pressed && styles.pressed]}
    >
      {progress !== undefined && <ProgressBar progress={progress} warning={over} />}
      <Text variant="caption" secondary>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs + 2 },
  pressed: { opacity: pressedOpacity },
});
