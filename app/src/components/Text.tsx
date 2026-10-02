// SPDX-License-Identifier: GPL-3.0-or-later
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { type, useColors } from '@/theme';

export type TextProps = RNTextProps & {
  variant?: keyof typeof type;
  secondary?: boolean;
};

export function Text({ variant = 'body', secondary = false, style, ...rest }: TextProps) {
  const c = useColors();
  return <RNText style={[type[variant], { color: secondary ? c.textSecondary : c.text }, style]} {...rest} />;
}
