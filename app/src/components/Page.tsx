// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { spacing } from '@/theme';

/** Stack page under a native large-title header (settings, auth). `form` lets taps reach inputs and drags dismiss the keyboard. */
export function Page({ form = false, children }: { form?: boolean; children: ReactNode }) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode={form ? 'interactive' : 'none'}
      keyboardShouldPersistTaps={form ? 'handled' : 'never'}
      contentContainerStyle={styles.content}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg },
});
