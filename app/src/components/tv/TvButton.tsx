// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV button. primary = the screen's main action (filled), default = translucent capsule, quiet = text only (a
// second way or a way out) - all turn the palette's text colour, scale up and lift when focused. `round`: icon only,
// a circle (the title is what VoiceOver reads). A play button can carry the progress: a track and the time left.
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ComponentRef, Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { pressedOpacity, radii, tv, useColors } from '@/theme';

import { clamp01 } from '../ProgressBar';
import { Text } from '../Text';

/** What a ref to a TvButton holds (a focus guide destination). */
export type TvButtonHandle = ComponentRef<typeof Pressable>;

export type TvButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'default' | 'quiet';
  /** SF Symbol before the title. */
  icon?: SymbolViewProps['name'];
  /** Fills its column (a form's main button). */
  wide?: boolean;
  /** Icon-only circle; `title` becomes its accessibility label. */
  round?: boolean;
  /** 0-1 watched: a track after the title (play buttons). */
  progress?: number;
  /** Text after the track: "34m left". */
  trailing?: string;
  /** Removes something (menus): the danger colour while not focused. */
  destructive?: boolean;
  /** What VoiceOver reads when it isn't the title. */
  accessibilityLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Takes focus when the screen opens. */
  preferredFocus?: boolean;
  /** Focus arrived (the TV hero scrolls Home back to the top). */
  onFocus?: () => void;
  /** For a focus guide's destination. */
  ref?: Ref<TvButtonHandle>;
};

export function TvButton({
  title,
  onPress,
  variant = 'default',
  icon,
  wide = false,
  round = false,
  progress,
  trailing,
  accessibilityLabel,
  destructive = false,
  loading = false,
  disabled = false,
  preferredFocus,
  onFocus,
  ref,
}: TvButtonProps) {
  const c = useColors();
  const inactive = disabled || loading;
  const quiet = variant === 'quiet';
  const fill = variant === 'primary' ? c.accent : quiet ? 'transparent' : tv.unfocused;
  const ink = (focused: boolean) =>
    focused
      ? c.background
      : variant === 'primary'
        ? c.onAccent
        : destructive
          ? c.danger
          : quiet
            ? c.textSecondary
            : c.text;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={inactive ? undefined : onPress}
      hasTVPreferredFocus={preferredFocus}
      onFocus={onFocus}
      style={({ focused }) => [
        quiet ? styles.quiet : styles.base,
        round && styles.round,
        wide && styles.wide,
        { backgroundColor: focused ? c.text : fill },
        focused && styles.focused,
        disabled && !focused && styles.dimmed,
      ]}
    >
      {({ focused }) =>
        loading ? (
          <ActivityIndicator color={ink(focused)} />
        ) : (
          <>
            {icon && <SymbolView name={icon} tintColor={ink(focused)} size={tv.icon.button} />}
            {!round && (
              <Text numberOfLines={1} style={[quiet ? tv.type.quiet : tv.type.button, { color: ink(focused) }]}>
                {title}
              </Text>
            )}
            {progress !== undefined && (
              <View testID="tv-button-progress" style={styles.track}>
                <View style={[StyleSheet.absoluteFill, styles.trackBack, { backgroundColor: ink(focused) }]} />
                <View style={[styles.fill, { width: `${clamp01(progress) * 100}%`, backgroundColor: ink(focused) }]} />
              </View>
            )}
            {trailing !== undefined && (
              <Text numberOfLines={1} style={[tv.type.caption, styles.trailing, { color: ink(focused) }]}>
                {trailing}
              </Text>
            )}
          </>
        )
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: tv.button.height,
    paddingHorizontal: tv.button.paddingHorizontal,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: tv.gap.sm / 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  quiet: {
    height: tv.quietButton.height,
    paddingHorizontal: tv.quietButton.paddingHorizontal,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: tv.gap.sm / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wide: { alignSelf: 'stretch' },
  round: { width: tv.button.height, paddingHorizontal: 0 },
  // The unwatched part: the text colour at low strength; the watched part at full strength.
  track: { width: 140, height: 8, borderRadius: radii.pill, overflow: 'hidden', marginHorizontal: tv.gap.sm / 2 },
  trackBack: { opacity: 0.3 },
  fill: { height: '100%', borderRadius: radii.pill },
  trailing: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  focused: { transform: [{ scale: tv.focus.buttonScale }], ...tv.focus.shadow },
  dimmed: { opacity: pressedOpacity },
});
