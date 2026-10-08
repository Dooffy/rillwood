// SPDX-License-Identifier: GPL-3.0-or-later
import { useRef, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { backdrop, radii, scrollList, spacing, useColors } from '@/theme';

import { Checkmark } from './List';
import { Text } from './Text';

/** Row height of the sheet's actions and Cancel (iOS action sheet). */
const ROW_HEIGHT = 56;
/** Landscape / wide screens: centred, no wider than the iOS action sheet. */
const MAX_WIDTH = 500;

export type SheetAction = {
  label: string;
  /** Second line: "5 unwatched", "8 episodes". */
  detail?: string;
  /** Current choice (season menu): checkmark. */
  selected?: boolean;
  onPress: () => void;
};

export type ActionSheetProps = {
  visible: boolean;
  /** Small heading over the actions: "S2, E3 · Pilot". */
  title?: string;
  actions?: SheetAction[];
  /** Content over the actions (a control that applies as it changes, rather than a pick). */
  children?: ReactNode;
  /** The bottom button: "Cancel" by default, "Done" for a sheet whose content applies as it changes. */
  closeLabel?: string;
  onClose: () => void;
};

/**
 * Bottom sheet of optional content, actions + Cancel (or `closeLabel`) - iOS action sheet look, both platforms. Picking an
 * action closes it first.
 */
export function ActionSheet({
  visible,
  title,
  actions = [],
  children,
  closeLabel = 'Cancel',
  onClose,
}: ActionSheetProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  // iOS can't present another screen (the player is a full-screen modal) while this one is still closing: the picked
  // action runs once the sheet is gone (onDismiss is iOS-only, so other platforms run it right away).
  const pending = useRef<(() => void) | null>(null);
  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };
  const pick = (action: SheetAction) => {
    pending.current = action.onPress;
    onClose();
    if (Platform.OS !== 'ios') runPending();
  };
  return (
    // All orientations: the sheet follows the screen (the portrait lock lives in expo-screen-orientation).
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
      onDismiss={runPending}
    >
      <Pressable accessibilityLabel="Close" accessibilityRole="button" style={styles.backdrop} onPress={onClose} />
      {/* Never past the safe area: a long list (subtitles in landscape) scrolls instead. */}
      <View
        style={[
          styles.sheet,
          {
            paddingTop: insets.top + spacing.sm,
            paddingBottom: insets.bottom + spacing.sm,
            paddingLeft: insets.left + spacing.sm,
            paddingRight: insets.right + spacing.sm,
          },
        ]}
      >
        <View
          accessibilityRole="menu"
          style={[styles.group, styles.width, styles.menu, { backgroundColor: c.elevated }]}
        >
          {title !== undefined && (
            <Text variant="caption" secondary style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          )}
          {children}
          {actions.length > 0 && (
            <ScrollView {...scrollList} testID="action-sheet-list" alwaysBounceVertical={false}>
              {actions.map((action, i) => (
                <Pressable
                  // Labels can repeat (two tracks named alike).
                  key={`${i}-${action.label}`}
                  accessibilityRole="menuitem"
                  accessibilityLabel={action.detail ? `${action.label}, ${action.detail}` : action.label}
                  accessibilityState={action.selected === undefined ? undefined : { selected: action.selected }}
                  onPress={() => pick(action)}
                  style={({ pressed }) => [
                    styles.action,
                    (i > 0 || title !== undefined) && [styles.divider, { borderTopColor: c.separator }],
                    pressed && { backgroundColor: c.elevated2 },
                  ]}
                >
                  <View style={styles.check}>{action.selected && <Checkmark />}</View>
                  <View style={styles.labels}>
                    <Text>{action.label}</Text>
                    {action.detail !== undefined && (
                      <Text variant="caption" secondary>
                        {action.detail}
                      </Text>
                    )}
                  </View>
                  {/* Same width as the checkmark column, so labels stay centred. */}
                  <View style={styles.check} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [
            styles.group,
            styles.width,
            styles.cancel,
            { backgroundColor: pressed ? c.elevated2 : c.elevated },
          ]}
        >
          <Text variant="button">{closeLabel}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: backdrop },
  // box-none: taps outside the groups reach the backdrop.
  sheet: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    pointerEvents: 'box-none',
  },
  group: { borderRadius: radii.card, overflow: 'hidden' },
  width: { width: '100%', maxWidth: MAX_WIDTH },
  // Shrinks below its content when the screen is short; the actions scroll, the title stays.
  menu: { flexShrink: 1 },
  title: { textAlign: 'center', paddingTop: spacing.md, paddingBottom: spacing.sm, paddingHorizontal: spacing.md },
  action: {
    minHeight: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  check: { width: spacing.lg },
  labels: { flex: 1, alignItems: 'center' },
  cancel: { minHeight: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
});
