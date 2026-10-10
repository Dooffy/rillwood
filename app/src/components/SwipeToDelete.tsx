// SPDX-License-Identifier: GPL-3.0-or-later
// Swipe a row left to show a red Delete button (iOS list style). The button asks first (`onDelete`), and the row
// closes again either way. VoiceOver can't swipe: rows also offer Delete in their long-press ("More") menu. Needs a
// `GestureHandlerRootView` above it (the screen).
import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { minTouch, onDanger, pressedOpacity, spacing, useColors } from '@/theme';

import { Text } from './Text';

const ACTION_WIDTH = 88;

export function SwipeToDelete({
  label,
  onDelete,
  children,
}: {
  /** The action's accessibility label: "Delete Sintel". */
  label: string;
  onDelete: () => void;
  children: ReactNode;
}) {
  const c = useColors();
  const swipeable = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      // Opaque, so the action stays hidden under the row until it slides.
      childrenContainerStyle={{ backgroundColor: c.background }}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => {
            swipeable.current?.close();
            onDelete();
          }}
          style={({ pressed }) => [styles.action, { backgroundColor: c.danger }, pressed && styles.pressed]}
        >
          <Text variant="label" style={{ color: onDanger }}>
            Delete
          </Text>
        </Pressable>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: ACTION_WIDTH,
    minHeight: minTouch,
    marginLeft: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: pressedOpacity },
});
