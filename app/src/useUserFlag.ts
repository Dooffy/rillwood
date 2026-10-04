// SPDX-License-Identifier: GPL-3.0-or-later
// Mark watched / favourite from a button or menu: the change (src/userData.ts), a toast when it fails, and a
// confirmation before unwatching a whole season or show (it clears every episode's progress).
import { useCallback } from 'react';
import { Alert } from 'react-native';

import type { BaseItemDto } from '@/api';
import { useToast } from '@/components/Toast';
import type { UserFlag } from '@/items';
import { setUserFlag, userFlagError } from '@/userData';

export function useUserFlag(): (item: BaseItemDto, flag: UserFlag, value: boolean) => void {
  const toast = useToast();
  return useCallback(
    (item, flag, value) => {
      const run = () => {
        void setUserFlag(item, flag, value).then((error) => error && toast(userFlagError(flag, value, error)));
      };
      if (flag === 'played' && !value && (item.Type === 'Season' || item.Type === 'Series')) {
        Alert.alert(
          `Mark ${item.Name} as unwatched?`,
          'Every episode goes back to unwatched, and resume points are cleared.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Mark Unwatched', style: 'destructive', onPress: run },
          ],
        );
      } else {
        run();
      }
    },
    [toast],
  );
}
