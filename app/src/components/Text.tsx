// SPDX-License-Identifier: GPL-3.0-or-later
import { Text as RNText, View, type DimensionValue, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { radii, type, useColors } from '@/theme';

export type TextProps = RNTextProps & {
  variant?: keyof typeof type;
  secondary?: boolean;
};

export function Text({ variant = 'body', secondary = false, style, ...rest }: TextProps) {
  const c = useColors();
  return <RNText style={[type[variant], { color: secondary ? c.textSecondary : c.text }, style]} {...rest} />;
}

/**
 * A loading placeholder for one line of `style` text: exactly as tall as that line (a hidden line of the same text
 * sets it, so it is the font's own line height), a grey bar the font size tall in it. Placeholders built from these
 * take the space the text will, so nothing moves when it loads.
 */
export function TextBone({ style, width = '100%' }: { style: TextStyle; width?: DimensionValue }) {
  const c = useColors();
  return (
    <View testID="text-bone" style={{ width }}>
      <RNText style={[style, hidden]}> </RNText>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          marginTop: -(style.fontSize ?? 0) / 2,
          height: style.fontSize,
          borderRadius: radii.card / 2,
          backgroundColor: c.surface,
        }}
      />
    </View>
  );
}

const hidden = { color: 'transparent' } as const;
