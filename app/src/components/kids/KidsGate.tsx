// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode grown-up gate (docs/context/kids.md, Grown-up gate): a bottom sheet with a multiplication in words and a
// keypad. Two digits typed → checked: wrong shakes and asks a new one; right goes green, a checkmark pops in, then the
// grown-up actions take its place. No PIN, nothing to remember. Built on `ActionSheet` (an action runs once the sheet
// is gone - iOS can't present over a closing modal; its Cancel closes).
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { Text } from '@/components/Text';
import { ANSWER_DIGITS, isAnswer, newSum, sumQuestion, type Sum } from '@/kidsGate';
import { kids, pressedOpacity, radii, spacing, useColors } from '@/theme';

/** How long the checkmark shows before the actions take its place. */
export const SOLVED_MS = 1700;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'] as const;

type GateProps = {
  visible: boolean;
  /** What a grown-up can do once through (shown after the right answer). */
  actions: SheetAction[];
  onClose: () => void;
};

/** The sheet: the question first; the right answer swaps it for the actions. A new question each time it opens. */
export function KidsGate({ visible, actions, onClose }: GateProps) {
  const [solved, setSolved] = useState(false);
  const [opened, setOpened] = useState(visible);
  // Closed → the next opening starts over (a new question, no actions).
  if (opened !== visible) {
    setOpened(visible);
    if (!visible) setSolved(false);
  }
  return (
    <ActionSheet
      visible={visible}
      title={solved ? 'Grown-ups' : undefined}
      actions={solved ? actions : []}
      onClose={onClose}
    >
      {visible && !solved && <Question onSolved={() => setSolved(true)} />}
    </ActionSheet>
  );
}

function Question({ onSolved }: { onSolved: () => void }) {
  const c = useColors();
  const [sum, setSum] = useState<Sum>(() => newSum());
  const [digits, setDigits] = useState('');
  const [right, setRight] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(0));
  const done = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(done.current), []);

  const press = (key: (typeof KEYS)[number]) => {
    if (right) return;
    if (key === 'delete') return setDigits((d) => d.slice(0, -1));
    const typed = digits + key;
    if (typed.length < ANSWER_DIGITS) return setDigits(typed);
    if (isAnswer(sum, typed)) {
      // Right: the answer stays, the boxes go green, a checkmark pops in, then the actions.
      setDigits(typed);
      setRight(true);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
      done.current = setTimeout(onSolved, SOLVED_MS);
      return;
    }
    // Wrong: a shake, then a fresh question.
    setDigits('');
    setSum((s) => newSum(Math.random, s));
    Animated.sequence(
      [12, -12, 8, -8, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 60, useNativeDriver: true })),
    ).start();
  };

  return (
    <View style={styles.body}>
      <Text variant="sectionHeader" style={styles.center}>
        Grown-ups only
      </Text>
      <Text testID="kids-sum" style={[styles.center, kids.type.gateQuestion]}>
        {sumQuestion(sum)}
      </Text>
      <Animated.View style={[styles.boxes, { transform: [{ translateX: shake }] }]}>
        {Array.from({ length: ANSWER_DIGITS }, (_, i) => (
          <Box key={i} digit={digits[i]} right={right} />
        ))}
      </Animated.View>
      <View style={styles.pad}>
        {KEYS.map((key, i) =>
          key === '' ? <View key={i} style={styles.key} /> : <Key key={i} name={key} onPress={() => press(key)} />,
        )}
        {right && (
          // Over the keypad (same room, so the sheet doesn't change size until the actions come).
          <Animated.View
            testID="kids-gate-right"
            accessible
            accessibilityLabel="Correct"
            style={[styles.right, { backgroundColor: c.elevated, opacity: pop }]}
          >
            <Animated.View style={{ transform: [{ scale: pop }] }}>
              <SymbolView
                name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }}
                tintColor={c.success}
                size={kids.gate.check}
              />
            </Animated.View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

function Box({ digit, right }: { digit?: string; right: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.box, { backgroundColor: c.elevated2, borderColor: right ? c.success : c.elevated2 }]}>
      <Text style={[kids.type.gateDigit, right && { color: c.success }]}>{digit ?? ''}</Text>
    </View>
  );
}

function Key({ name, onPress }: { name: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name === 'delete' ? 'Delete' : name}
      onPress={onPress}
      style={({ pressed }) => [styles.key, { backgroundColor: c.elevated2 }, pressed && styles.pressed]}
    >
      {name === 'delete' ? (
        <SymbolView name={{ ios: 'delete.left', android: 'backspace' }} tintColor={c.text} size={kids.gate.icon} />
      ) : (
        <Text style={kids.type.gateDigit}>{name}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, padding: spacing.md },
  center: { textAlign: 'center' },
  boxes: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm + 2 },
  box: {
    width: kids.gate.box,
    height: kids.gate.box * 1.15,
    borderRadius: radii.card,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: kids.gate.keyGap,
    width: kids.gate.key * 3 + kids.gate.keyGap * 2,
    alignSelf: 'center',
  },
  key: {
    width: kids.gate.key,
    height: kids.gate.key,
    borderRadius: kids.gate.key / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: pressedOpacity },
});
