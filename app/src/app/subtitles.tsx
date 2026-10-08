// SPDX-License-Identifier: GPL-3.0-or-later
// Settings → Subtitles: how subtitles look, on this phone for every account. The player menu only picks the track and
// its timing.
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { ColorSwatches } from '@/components/ColorSwatches';
import { ListSection } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { SUBTITLE_SAMPLES, SubtitlePreview, type SubtitleSample } from '@/components/SubtitlePreview';
import { Text } from '@/components/Text';
import {
  setSubtitleScale,
  setSubtitleStyle,
  SUBTITLE_COLORS,
  SUBTITLE_EDGES,
  SUBTITLE_FONTS,
  SUBTITLE_SIZES,
  useSubtitleScale,
  useSubtitleStyle,
} from '@/settings';
import { spacing } from '@/theme';

export default function Subtitles() {
  const scale = useSubtitleScale();
  const style = useSubtitleStyle();
  // Preview only: which script the sample lines are in.
  const [sample, setSample] = useState<SubtitleSample>('en');

  return (
    <Page>
      <View style={styles.preview}>
        <SubtitlePreview style={style} scale={scale} sample={sample} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.samples}>
          {SUBTITLE_SAMPLES.map((s) => (
            <Chip key={s.value} label={s.label} selected={s.value === sample} onPress={() => setSample(s.value)} />
          ))}
        </ScrollView>
      </View>
      <ListSection title="Size">
        <View style={styles.control}>
          <Segmented options={SUBTITLE_SIZES} value={scale} onChange={setSubtitleScale} />
        </View>
      </ListSection>
      <ListSection title="Font">
        <View style={styles.control}>
          <Segmented options={SUBTITLE_FONTS} value={style.font} onChange={(font) => setSubtitleStyle({ font })} />
        </View>
      </ListSection>
      <ListSection title="Colour">
        <ColorSwatches
          options={SUBTITLE_COLORS}
          value={style.color}
          onChange={(color) => setSubtitleStyle({ color })}
        />
      </ListSection>
      <ListSection title="Edge">
        <View style={styles.control}>
          <Segmented options={SUBTITLE_EDGES} value={style.edge} onChange={(edge) => setSubtitleStyle({ edge })} />
        </View>
      </ListSection>
      <Text variant="caption" secondary style={styles.note}>
        Applies to text subtitles (SRT, VTT). Styled (ASS) and picture (PGS) subtitles keep their own look.
      </Text>
    </Page>
  );
}

const styles = StyleSheet.create({
  preview: { gap: spacing.sm },
  samples: { gap: spacing.sm },
  control: { padding: spacing.sm },
  note: { paddingHorizontal: spacing.md },
});
