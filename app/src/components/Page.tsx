// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, type ReactNode } from 'react';
import { Keyboard, ScrollView, StyleSheet, View } from 'react-native';

import { scrollList, spacing } from '@/theme';

type PageProps = {
  /** Lets taps reach inputs and drags dismiss the keyboard. */
  form?: boolean;
  /** An async submit is running: the whole page ignores touches and the keyboard goes away. */
  busy?: boolean;
  children: ReactNode;
};

/** A page's padding and the space between its blocks: a stack screen built on a list instead of `Page` uses them too. */
export const pageContent = { padding: spacing.md, gap: spacing.lg } as const;

/** Stack page under a native large-title header (settings, auth). */
export function Page({ form = false, busy = false, children }: PageProps) {
  useEffect(() => {
    if (busy) Keyboard.dismiss();
  }, [busy]);

  return (
    <ScrollView
      {...scrollList}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode={form ? 'interactive' : 'none'}
      keyboardShouldPersistTaps={form ? 'handled' : 'never'}
    >
      <View
        testID="page-content"
        pointerEvents={busy ? 'none' : 'auto'}
        accessibilityState={{ busy }}
        style={styles.content}
      >
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: pageContent,
});
