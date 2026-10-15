// SPDX-License-Identifier: GPL-3.0-or-later
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { minTouch, pressedOpacity, radii, spacing, useColors } from '@/theme';

import { Text } from './Text';

export const TOAST_MS = 3000;
/** A toast with a button stays longer: time to reach it. */
export const ACTION_TOAST_MS = 6000;

/** A button on the toast ("Keep"): pressing it runs it and closes the toast. */
export type ToastAction = { label: string; onPress: () => void };

type ShowToast = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<ShowToast | null>(null);

/** One toast at a time; a new message replaces the current one and restarts the timer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const c = useColors();

  const show = useCallback<ShowToast>((message, action) => {
    clearTimeout(timer.current);
    setToast({ message, action });
    timer.current = setTimeout(() => setToast(null), action ? ACTION_TOAST_MS : TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast !== null && (
        // Touches pass through around it; only a button takes them.
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + spacing.lg }]}>
          <View
            pointerEvents={toast.action ? 'box-none' : 'none'}
            // One element for VoiceOver, unless its button has to be reachable: then the message is the alert.
            accessible={!toast.action}
            accessibilityRole={toast.action ? undefined : 'alert'}
            accessibilityLiveRegion="polite"
            style={[styles.toast, { backgroundColor: c.elevated }]}
          >
            <Text
              variant="body"
              accessibilityRole={toast.action ? 'alert' : undefined}
              style={toast.action && styles.text}
            >
              {toast.message}
            </Text>
            {toast.action && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
                hitSlop={spacing.sm}
                onPress={() => {
                  const { onPress } = toast.action!;
                  clearTimeout(timer.current);
                  setToast(null);
                  onPress();
                }}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: c.accent, opacity: pressed ? pressedOpacity : 1 },
                ]}
              >
                <Text variant="label" style={{ color: c.onAccent }}>
                  {toast.action.label}
                </Text>
              </Pressable>
            )}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  text: { flexShrink: 1 },
  button: {
    minHeight: minTouch - spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
});
