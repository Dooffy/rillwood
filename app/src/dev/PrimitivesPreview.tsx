// SPDX-License-Identifier: GPL-3.0-or-later
// Dev-only preview of the primitives in the active theme. Rendered from Home behind __DEV__; never ships.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { LandscapeCard, PosterCard } from '@/components/Card';
import { DownloadRing } from '@/components/DownloadRing';
import { IconButton } from '@/components/IconButton';
import { ListRow, ListSection } from '@/components/List';
import { ProgressBar } from '@/components/ProgressBar';
import { Row } from '@/components/Row';
import { Segmented } from '@/components/Segmented';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { APPEARANCE_OPTIONS, setAppearance, useAppearance } from '@/settings';
import { radii, spacing, type, useColors } from '@/theme';

// Blender open movies on Wikimedia Commons (CC BY 2.5 / 3.0, Blender Foundation) - real artwork for the card preview.
const COMMONS = 'https://thumb.wikimedia.org/wikipedia/commons/thumb';
const ART = {
  sintelPoster: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg',
  bunnyPoster: `${COMMONS}/c/c5/Big_buck_bunny_poster_big.jpg/960px-Big_buck_bunny_poster_big.jpg`,
  tearsPoster: `${COMMONS}/7/70/Tos-poster.png/960px-Tos-poster.png`,
  sintelStill: `${COMMONS}/f/fa/Sintel-screenshot-1.jpg/960px-Sintel-screenshot-1.jpg`,
  tearsStill: `${COMMONS}/1/18/Tears_of_Steel_frame_01_2a.jpg/960px-Tears_of_Steel_frame_01_2a.jpg`,
  bunnyStill: `${COMMONS}/7/70/Big.Buck.Bunny.-.Opening.Screen.png/960px-Big.Buck.Bunny.-.Opening.Screen.png`,
  elephantsStill: `${COMMONS}/e/e8/Elephants_Dream_s5_both.jpg/960px-Elephants_Dream_s5_both.jpg`,
};

export function PrimitivesPreview() {
  const c = useColors();
  const toast = useToast();
  const appearance = useAppearance();
  const [paused, setPaused] = useState(false);

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

      <View style={styles.block}>
        <TextField label="Text field" placeholder="Placeholder" />
        <TextField label="Secure field" secure defaultValue="secret" />
      </View>

      <ListSection title="List">
        <ListRow label="Tappable row" onPress={() => toast('Row pressed')} />
        <ListRow label="Read-only row" value="Value" />
      </ListSection>

      <Row title="Continue Watching" onPress={() => toast('Row pressed')}>
        <LandscapeCard
          title="Sintel"
          subtitle="S1:E1"
          image={ART.sintelStill}
          progress={0.4}
          remainingSeconds={540}
          onPress={() => toast('Card pressed')}
        />
        <LandscapeCard
          title="Tears of Steel"
          image={ART.tearsStill}
          progress={0.85}
          remainingSeconds={120}
          onPress={() => toast('Card pressed')}
        />
        <LandscapeCard
          title="Elephants Dream"
          image={ART.elephantsStill}
          progress={0.2}
          remainingSeconds={5520}
          onPress={() => toast('Card pressed')}
        />
        <LandscapeCard
          title="Missing image"
          image="https://invalid.example/x.jpg"
          progress={0.55}
          remainingSeconds={1920}
          onPress={() => toast('Card pressed')}
        />
        <LandscapeCard
          title="Big Buck Bunny"
          subtitle="Watched"
          image={ART.bunnyStill}
          played
          onPress={() => toast('Card pressed')}
        />
      </Row>

      <Row title="Recently Added">
        <PosterCard title="Sintel" subtitle="2010" image={ART.sintelPoster} onPress={() => toast('Poster pressed')} />
        <PosterCard
          title="Big Buck Bunny"
          subtitle="2008"
          image={ART.bunnyPoster}
          played
          onPress={() => toast('Poster pressed')}
        />
        <PosterCard
          title="Tears of Steel"
          subtitle="2012"
          image={ART.tearsPoster}
          progress={0.3}
          onPress={() => toast('Poster pressed')}
        />
        <PosterCard
          title="Missing image"
          image="https://invalid.example/x.jpg"
          progress={0.5}
          onPress={() => toast('Poster pressed')}
        />
      </Row>

      <View style={styles.block}>
        <ProgressBar progress={0.35} />
        <View style={styles.row}>
          <DownloadRing progress={0.3} paused={paused} onPress={() => setPaused((p) => !p)} />
          <DownloadRing progress={0.7} paused />
          <DownloadRing progress={0.95} size={44} />
        </View>
      </View>

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
