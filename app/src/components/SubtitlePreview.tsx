// SPDX-License-Identifier: GPL-3.0-or-later
// Live preview of the subtitle style (Settings → Subtitles): a 16:9 stand-in picture with two lines of text, sized as
// mpv sizes them (`sub-font-size` 55 at a 720 px tall picture, times the scale). Outline and shadow are approximations -
// React Native draws one text shadow. A sample language shows how other scripts render (preview only, not saved).
import { useState } from 'react';
import { Platform, Text, View, StyleSheet, type TextStyle } from 'react-native';

import type { SubtitleFont, SubtitleStyle } from '@/player/Player';
import { radii, spacing, subtitleEdge, subtitlePreviewScene } from '@/theme';

// mpv's default `sub-font-size` and the picture height it is relative to.
const MPV_FONT_SIZE = 55;
const MPV_HEIGHT = 720;

// The faces the player uses: bundled Noto on iOS (`app.json`), system families on Android.
const FAMILIES: Record<SubtitleFont, string> = Platform.select({
  ios: { 'sans-serif': 'NotoSans-Regular', serif: 'NotoSerif-Regular', monospace: 'NotoSansMono-Regular' },
  default: { 'sans-serif': 'sans-serif', serif: 'serif', monospace: 'monospace' },
});

/** Sample lines per language. `face`: the bundled iOS font libass falls back to for that script (no Serif / Mono). */
export const SUBTITLE_SAMPLES = [
  { value: 'en', label: 'English', text: 'Subtitles look like this,\non every video.' },
  { value: 'es', label: 'Español', text: 'Así se ven los subtítulos\nen cada vídeo.' },
  { value: 'de', label: 'Deutsch', text: 'So sehen Untertitel aus,\nin jedem Video.' },
  { value: 'fr', label: 'Français', text: 'Voici à quoi ressemblent\nles sous-titres.' },
  { value: 'uk', label: 'Українська', text: 'Так виглядають субтитри\nу кожному відео.' },
  { value: 'ar', label: 'العربية', text: 'هكذا تبدو الترجمة\nفي كل فيديو.', face: 'NotoSansArabic-Regular', rtl: true },
  { value: 'he', label: 'עברית', text: 'כך נראות הכתוביות\nבכל סרטון.', face: 'NotoSansHebrew-Regular', rtl: true },
  { value: 'zh', label: '中文', text: '字幕看起来是这样的，\n每个视频都一样。', face: 'NotoSansCJKsc-Regular' },
  { value: 'ja', label: '日本語', text: '字幕はこのように\n表示されます。', face: 'NotoSansCJKsc-Regular' },
  { value: 'ko', label: '한국어', text: '자막은 이렇게\n표시됩니다.', face: 'NotoSansCJKsc-Regular' },
] as const satisfies readonly { value: string; label: string; text: string; face?: string; rtl?: boolean }[];

export type SubtitleSample = (typeof SUBTITLE_SAMPLES)[number]['value'];

const EDGES: Record<SubtitleStyle['edge'], TextStyle> = {
  outline: { textShadowColor: subtitleEdge.outline, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
  shadow: { textShadowColor: subtitleEdge.shadow, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 2 },
  box: {},
};

export function SubtitlePreview({
  style,
  scale,
  sample,
}: {
  style: SubtitleStyle;
  scale: number;
  sample: SubtitleSample;
}) {
  const [height, setHeight] = useState(0);
  const fontSize = (height * MPV_FONT_SIZE * scale) / MPV_HEIGHT;
  const lines: { text: string; face?: string; rtl?: boolean } =
    SUBTITLE_SAMPLES.find((s) => s.value === sample) ?? SUBTITLE_SAMPLES[0];
  const family = (Platform.OS === 'ios' && lines.face) || FAMILIES[style.font];
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
