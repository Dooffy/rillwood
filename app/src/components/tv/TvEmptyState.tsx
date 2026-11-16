// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV empty / offline state: a big icon, a title and one line on what to do next, centred in the space it's given,
// with the actions under it (Search with no results, Home or Library with nothing in it, `TvOffline`). The text is read
// as one element by VoiceOver; the actions stay their own buttons.
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { tv, useColors } from '@/theme';

import { Text } from '../Text';

export type TvEmptyStateProps = {
  icon: SymbolViewProps['name'];
  title: string;
  text?: string;
  /** Buttons under the text, side by side. */
  children?: ReactNode;
  /** Takes the space it's in, centred up and down (nothing else on screen) - else it sits near the top. */
  fill?: boolean;
  /** Screen readers announce it (an offline state that appears without a screen change). */
  alert?: boolean;
  testID?: string;
};

export function TvEmptyState({ icon, title, text, children, fill = false, alert = false, testID }: TvEmptyStateProps) {
  const c = useColors();
  return (
    <View testID={testID} style={[styles.root, fill && styles.fill]}>
      <View
        accessible
        accessibilityRole={alert ? 'alert' : undefined}
        accessibilityLabel={[title, text].filter(Boolean).join('. ')}
        style={styles.copy}
      >
        <SymbolView name={icon} tintColor={c.textSecondary} size={tv.empty.icon} />
        <Text numberOfLines={2} style={[tv.type.shelf, styles.center]}>
          {title}
        </Text>
        {text !== undefined && (
          <Text secondary style={[tv.type.body, styles.center]}>
            {text}
          </Text>
        )}
      </View>
      {children && <View style={styles.actions}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: tv.gap.lg,
    paddingTop: tv.empty.top,
    maxWidth: tv.empty.width,
    alignSelf: 'center',
  },
  fill: { flex: 1, justifyContent: 'center', paddingTop: 0 },
  copy: { alignItems: 'center', gap: tv.gap.sm },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: tv.gap.sm },
});
