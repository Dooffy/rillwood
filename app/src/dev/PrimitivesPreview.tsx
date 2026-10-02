// SPDX-License-Identifier: GPL-3.0-or-later
// Dev-only preview of the primitives in the active theme. Rendered from Home behind __DEV__; never ships.
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { ListRow, ListSection } from '@/components/List';
import { Segmented } from '@/components/Segmented';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { APPEARANCE_OPTIONS, setAppearance, useAppearance } from '@/settings';
import { radii, spacing, type, useColors } from '@/theme';

export function PrimitivesPreview() {
  const c = useColors();
  const toast = useToast();
  const appearance = useAppearance();

  return (
    <View style={styles.container}>
      <Segmented options={APPEARANCE_OPTIONS} value={appearance} onChange={setAppearance} />

      <View style={styles.block}>
        {(Object.keys(type) as (keyof typeof type)[]).map((variant) => (
          <Text key={variant} variant={variant}>
            {variant}
          </Text>
        ))}
        <Text secondary>secondary text</Text>
      </View>

      <View style={styles.swatches}>
        {(Object.keys(c) as (keyof typeof c)[]).map((token) => (
          <View key={token} style={styles.swatch}>
            <View style={[styles.chip, { backgroundColor: c[token], borderColor: c.separator }]} />
            <Text variant="caption" secondary numberOfLines={1}>
              {token}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.block}>
        <Button title="Primary" onPress={() => toast('Primary pressed')} />
        <Button title="Secondary" variant="secondary" onPress={() => toast('Secondary pressed')} />
        <Button title="Loading" loading onPress={() => {}} />
        <Button title="Disabled" disabled onPress={() => {}} />
      </View>

      <View style={styles.row}>
        <IconButton
          icon={{ ios: 'play.fill', android: 'play_arrow' }}
          label="Play"
          variant="primary"
          onPress={() => toast('Play pressed')}
        />
        <IconButton icon={{ ios: 'plus', android: 'add' }} label="Add" onPress={() => toast('Add pressed')} />
        <IconButton
          icon={{ ios: 'arrow.down', android: 'download' }}
          label="Download"
          onPress={() => toast('Download pressed')}
        />
      </View>

      <ListSection title="List">
        <ListRow label="Tappable row" onPress={() => toast('Row pressed')} />
        <ListRow label="Read-only row" value="Value" />
      </ListSection>

      <Spinner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.lg },
  block: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 72, alignItems: 'center', gap: spacing.xs },
  chip: { width: 40, height: 40, borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth },
});
