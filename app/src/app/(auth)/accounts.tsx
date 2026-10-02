// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';

export default function Accounts() {
  return (
    <Screen title="Accounts">
      <Button title="Add server" onPress={() => router.push('/server')} />
    </Screen>
  );
}
