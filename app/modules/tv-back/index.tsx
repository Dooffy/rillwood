// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV: catches the remote's Back (Menu) key on a pushed screen while `enabled` (see ios/TvBackModule.swift) - the
// native stack takes it before `BackHandler` there. Elsewhere (phones, tests without the native view) a plain View.
import { requireNativeView } from 'expo';
import type { ComponentType, ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

export type TvBackViewProps = {
  /** Something on the screen takes Back now: the press comes here instead of leaving the screen. */
  enabled: boolean;
  onBack: () => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

type NativeProps = Omit<TvBackViewProps, 'onBack'> & { onBack: () => void };

function nativeView(): ComponentType<NativeProps> | undefined {
  if (!Platform.isTV) return undefined;
  try {
    return requireNativeView<NativeProps>('TvBack');
  } catch {
    return undefined;
  }
}

const Native = nativeView();

export function TvBackView({ enabled, onBack, style, children }: TvBackViewProps) {
  if (!Native) return <View style={style}>{children}</View>;
  return (
    <Native enabled={enabled} onBack={onBack} style={style}>
      {children}
    </Native>
  );
}
