// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import type { ApiError } from '@/api';
import { spacing } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

/** Short load-error copy: offline vs anything else (401 already signs out). */
export function loadErrorMessage(error: ApiError): string {
  return error.kind === 'network' ? "Couldn't reach the server." : "Couldn't load this.";
}

/** Secondary text with an optional Retry. `fill` centres it in the whole screen (error / empty states). */
export function Message({ text, retry, fill = false }: { text: string; retry?: () => void; fill?: boolean }) {
  return (
    <View style={[styles.message, fill && styles.fill]}>
      <Text secondary style={fill && styles.center}>
        {text}
      </Text>
      {retry && <Button title="Retry" variant="secondary" onPress={retry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  message: { gap: spacing.md, alignItems: 'flex-start' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  center: { textAlign: 'center' },
});
