// SPDX-License-Identifier: GPL-3.0-or-later
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radii, spacing, useColors } from '@/theme';

import { Text } from './Text';

export const TOAST_MS = 3000;

type ShowToast = (message: string) => void;

/** Toast for buttons that are placeholders until their feature lands. */
export const SOON = 'Coming in a later build.';

const ToastContext = createContext<ShowToast | null>(null);

/** One toast at a time; a new message replaces the current one and restarts the timer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const c = useColors();

  const show = useCallback<ShowToast>((next) => {
    clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message !== null && (
        <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + spacing.lg }]}>
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.toast, { backgroundColor: c.elevated }]}
          >
            <Text variant="body">{message}</Text>
          </View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside ToastProvider');
  return show;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center' },
  toast: {
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
});
