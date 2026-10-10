// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import { formatBytes } from '@/format';
import { spacing } from '@/theme';

import { ProgressBar } from './ProgressBar';
import { Text } from './Text';

/** Downloads vs free space on the device (Downloads tab). `free` undefined = not read yet / unknown: no bar. */
export function StorageBar({ used, free }: { used: number; free?: number }) {
  const text = `Downloads ${formatBytes(used)}${free === undefined ? '' : ` · ${formatBytes(free)} free`}`;
  return (
    <View style={styles.box} accessible accessibilityLabel={text}>
      {free !== undefined && <ProgressBar progress={used / (used + free || 1)} />}
      <Text variant="caption" secondary>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs + 2 },
});
