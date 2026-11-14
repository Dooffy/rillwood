// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV empty state: a big icon, a title and one line on what to do next, centred in the space it's given (Search
// with no results; later the TV empty / offline screens, roadmap TV task 18). Read as one element by VoiceOver.
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { tv, useColors } from '@/theme';

import { Text } from '../Text';

export type TvEmptyStateProps = {
  icon: SymbolViewProps['name'];
  title: string;
  text?: string;
  testID?: string;
};

export function TvEmptyState({ icon, title, text, testID }: TvEmptyStateProps) {
  const c = useColors();
  return (
    <View testID={testID} accessible accessibilityLabel={[title, text].filter(Boolean).join('. ')} style={styles.root}>
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
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: tv.gap.sm,
    paddingTop: tv.empty.top,
    maxWidth: tv.empty.width,
    alignSelf: 'center',
  },
  center: { textAlign: 'center' },
});
