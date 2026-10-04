// SPDX-License-Identifier: GPL-3.0-or-later
import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { IconButton } from './IconButton';
import { SOON, useToast } from './Toast';

/** Header buttons of a detail screen: Download on the right (placeholder until M5). */
export function DetailHeader({ label = 'Download' }: { label?: string }) {
  const toast = useToast();
  // Stable options: a new object on every screen render would update the native header each time.
  const options = useMemo(
    () => ({
      headerRight: () => (
        <IconButton
          variant="plain"
          icon={{ ios: 'arrow.down', android: 'download' }}
          label={label}
          onPress={() => toast(SOON)}
        />
      ),
    }),
    [label, toast],
  );
  return <Stack.Screen options={options} />;
}
