// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV on-screen keyboard (Search, screen draft 06 - left column): abc / 123 pills on top, then the keys six to a
// row - letters by default, digits and a few title characters behind 123 - and Space, Delete, Clear. Keys are plain
// text until focused (a white tile), the action keys a soft fill. Ours, not the system's inline one: that one hides
// itself when focus moves into results it doesn't own, and couldn't be reached again. Dictation goes through the field
// above it (a click opens the system's full-screen keyboard, `TvTextField`).
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radii, tv, useColors } from '@/theme';

import { Text } from '../Text';
import { focusStyles, TvFocusRow } from './focus';
import { TvPill } from './TvPill';

const LAYOUTS = {
  letters: [...'abcdefghijklmnopqrstuvwxyz'],
  // Digits, then what titles use: "Spider-Man", "Ocean's", "Fast & Furious", "Mr. Robot", "Star Wars: Andor", "2,000".
  numbers: [...'1234567890', '-', "'", '&', '.', ':', ','],
} as const;

type Layout = keyof typeof LAYOUTS;

type KeyProps = {
  label: string;
  /** VoiceOver: "Space", "Delete"; a character reads itself. */
  accessibilityLabel?: string;
  icon?: SymbolViewProps['name'];
  /** Keys this many wide (Space, Delete, Clear). */
  span?: number;
  /** Action keys (Space, Delete, Clear): a soft fill; characters are plain text until focused. */
  filled?: boolean;
  onPress: () => void;
};

const Key = memo(function Key({ label, accessibilityLabel, icon, span = 1, filled = false, onPress }: KeyProps) {
  const c = useColors();
  const width = span * tv.keyboard.key + (span - 1) * tv.keyboard.gap;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ focused }) => [
        styles.key,
        { width, backgroundColor: focused ? c.text : filled ? tv.unfocused : 'transparent' },
        focused && focusStyles.pill,
      ]}
    >
      {({ focused }) =>
        icon ? (
          <SymbolView name={icon} tintColor={focused ? c.background : c.text} size={tv.icon.button} />
        ) : (
          <Text style={[tv.type.button, { color: focused ? c.background : c.text }]}>{label}</Text>
        )
      }
    </Pressable>
  );
});

export type TvKeyboardProps = {
  /** A key typed: a character to add. */
  onKey: (char: string) => void;
  onDelete: () => void;
  onClear: () => void;
};

export function TvKeyboard({ onKey, onDelete, onClear }: TvKeyboardProps) {
  const [layout, setLayout] = useState<Layout>('letters');
  return (
    <View testID="tv-keyboard" style={styles.keyboard}>
      <TvFocusRow style={styles.layouts}>
        <TvPill label="abc" selected={layout === 'letters'} onPress={() => setLayout('letters')} />
        <TvPill label="123" selected={layout === 'numbers'} onPress={() => setLayout('numbers')} />
      </TvFocusRow>
      <View style={styles.grid}>
        {LAYOUTS[layout].map((k) => (
          <Key key={k} label={k} onPress={() => onKey(k)} />
        ))}
      </View>
      <View style={styles.grid}>
        <Key label="Space" icon="space" span={2} filled onPress={() => onKey(' ')} />
        <Key label="Delete" icon="delete.left" span={2} filled onPress={onDelete} />
        <Key label="Clear" icon="xmark" span={2} filled onPress={onClear} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: { width: tv.keyboard.width, gap: tv.keyboard.gap },
  layouts: { flexDirection: 'row', gap: tv.gap.sm / 2, paddingBottom: tv.keyboard.gap },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tv.keyboard.gap },
  key: { height: tv.keyboard.key, borderRadius: radii.card, alignItems: 'center', justifyContent: 'center' },
});
