// SPDX-License-Identifier: GPL-3.0-or-later
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { radii, spacing, useColors } from '@/theme';

import { Text } from './Text';

/** Numbered step capsules ("1 Server - 2 Sign in"); the current one is filled. */
export function StepPills({ steps, current }: { steps: readonly string[]; current: number }) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}
      style={styles.row}
    >
      {steps.map((label, i) => {
        const active = i === current;
        return (
          <Fragment key={label}>
            {i > 0 && <View style={[styles.line, { backgroundColor: c.separator }]} />}
            <View
              testID={active ? 'step-active' : undefined}
              style={[styles.pill, { backgroundColor: active ? c.accent : c.surface }]}
            >
              <Text variant="label" style={{ color: active ? c.onAccent : c.textSecondary }}>
                {i + 1} {label}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { width: spacing.lg, height: 2 },
  pill: { minHeight: 32, paddingHorizontal: spacing.md, borderRadius: radii.pill, justifyContent: 'center' },
});
