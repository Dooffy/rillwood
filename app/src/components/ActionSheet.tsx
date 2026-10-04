// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
import { useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { backdrop, radii, spacing, useColors } from '@/theme';

import { Text } from './Text';

/** Row height of the sheet's actions and Cancel (iOS action sheet). */
const ROW_HEIGHT = 56;

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
  actions: SheetAction[];
  onClose: () => void;
};

/** Bottom sheet of actions + Cancel (iOS action sheet look, both platforms). Picking an action closes it first. */
export function ActionSheet({ visible, title, actions, onClose }: ActionSheetProps) {
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={runPending}>
      <Pressable accessibilityLabel="Close" accessibilityRole="button" style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View accessibilityRole="menu" style={[styles.group, { backgroundColor: c.elevated }]}>
          {title !== undefined && (
            <Text variant="caption" secondary style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          )}
          {actions.map((action, i) => (
            <Pressable
              key={action.label}
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
              <View style={styles.check}>
                {action.selected && (
                  <SymbolView name={{ ios: 'checkmark', android: 'check' }} tintColor={c.text} size={16} />
                )}
              </View>
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
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [
            styles.group,
            styles.cancel,
            { backgroundColor: pressed ? c.elevated2 : c.elevated },
          ]}
        >
          <Text variant="button">Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: backdrop },
  sheet: { position: 'absolute', left: spacing.sm, right: spacing.sm, bottom: 0, gap: spacing.sm },
  group: { borderRadius: radii.card, overflow: 'hidden' },
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
