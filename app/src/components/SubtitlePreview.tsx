// SPDX-License-Identifier: GPL-3.0-or-later
// Live preview of the saved subtitle style (Settings → Subtitles and its option lists): a 16:9 stand-in picture with two lines of text, sized as
// mpv sizes them (`sub-font-size` 55 at a 720 px tall picture, times the scale). Outline and shadow are approximations -
// React Native draws one text shadow. The sample language shows how other scripts render (preview only, not saved).
import { useState } from 'react';
import { Platform, Text, View, StyleSheet, type TextStyle } from 'react-native';

import type { SubtitleStyle } from '@/player/Player';
import {
  SUBTITLE_SAMPLES,
  subtitleFontFamily,
  useSubtitleSample,
  useSubtitleScale,
  useSubtitleStyle,
} from '@/settings';
import { radii, spacing, subtitleEdge, subtitlePreviewScene } from '@/theme';

// mpv's default `sub-font-size` and the picture height it is relative to.
const MPV_FONT_SIZE = 55;
const MPV_HEIGHT = 720;

const EDGES: Record<SubtitleStyle['edge'], TextStyle> = {
  outline: { textShadowColor: subtitleEdge.outline, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
  shadow: { textShadowColor: subtitleEdge.shadow, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 2 },
  box: {},
};

export function SubtitlePreview() {
  const style = useSubtitleStyle();
  const scale = useSubtitleScale();
  const sample = useSubtitleSample();
  const [height, setHeight] = useState(0);
  const fontSize = (height * MPV_FONT_SIZE * scale) / MPV_HEIGHT;
  const lines: { text: string; face?: string; rtl?: boolean } =
    SUBTITLE_SAMPLES.find((s) => s.value === sample) ?? SUBTITLE_SAMPLES[0];
  const family = (Platform.OS === 'ios' && lines.face) || subtitleFontFamily(style.font);
  return (
    <View
      testID="subtitle-preview"
      accessible
      accessibilityLabel="Subtitle preview"
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={styles.scene}
    >
      {height > 0 && (
        <View style={[styles.lines, style.edge === 'box' && styles.box]}>
          <Text
            style={[
              styles.text,
              { fontSize, lineHeight: fontSize * 1.25, color: style.color, fontFamily: family },
              lines.rtl && styles.rtl,
              EDGES[style.edge],
            ]}
          >
            {lines.text}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    aspectRatio: 16 / 9,
    borderRadius: radii.card,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing.md,
    backgroundImage: subtitlePreviewScene,
  },
  lines: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: spacing.xs },
  box: { backgroundColor: subtitleEdge.box },
  text: { textAlign: 'center' },
  rtl: { writingDirection: 'rtl' },
});
