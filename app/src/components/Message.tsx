// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import type { ApiError } from '@/api';
import { spacing } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

/** Load-error copy that says what to do next: offline, a server failure, anything else (401 already signs out). */
export function loadErrorMessage(error: ApiError): string {
  if (error.kind === 'network') return "Couldn't reach the server. Check your connection and try again.";
  if (error.status !== undefined && error.status >= 500) return 'The server ran into a problem. Try again in a moment.';
  return "Couldn't load this. Try again.";
}

/**
 * The one empty / error look: secondary text that says what to do next, with an optional Retry. `fill` centres it in
 * the whole screen; `alert` has screen readers announce it (an error that appears without a screen change).
 */
export function Message({
  text,
  retry,
  fill = false,
  alert = false,
}: {
  text: string;
  retry?: () => void;
  fill?: boolean;
  alert?: boolean;
}) {
  return (
    <View style={[styles.message, fill && styles.fill]}>
      <Text secondary style={fill && styles.center} accessibilityRole={alert ? 'alert' : undefined}>
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
