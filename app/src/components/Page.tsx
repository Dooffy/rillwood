// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, type ReactNode } from 'react';
import { Keyboard, ScrollView, StyleSheet, View } from 'react-native';

import { readableWidth, scrollList, spacing } from '@/theme';

type PageProps = {
  /** Lets taps reach inputs and drags dismiss the keyboard. */
  form?: boolean;
  /** An async submit is running: the whole page ignores touches and the keyboard goes away. */
  busy?: boolean;
  /** The narrow form column on wide screens without being a form (auth flow). Forms are narrow too. */
  narrow?: boolean;
  children: ReactNode;
};

/** A page's padding and the space between its blocks: a stack screen built on a list instead of `Page` uses them too. */
export const pageContent = { padding: spacing.md, gap: spacing.lg } as const;

/** A page's column: full width on phones, centred at `readableWidth.page` on wide screens (lists built like a page too). */
export const pageColumn = { width: '100%', maxWidth: readableWidth.page, alignSelf: 'center' } as const;

/** Stack page under a native large-title header (settings, auth). Wide screens: a centred, readable column. */
export function Page({ form = false, busy = false, narrow = form, children }: PageProps) {
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
        style={[styles.content, narrow && styles.narrow]}
      >
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Phones are narrower than both widths: no change there.
  content: { ...pageContent, ...pageColumn },
  narrow: { maxWidth: readableWidth.form },
});
