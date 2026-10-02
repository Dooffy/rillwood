// SPDX-License-Identifier: GPL-3.0-or-later
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';

export default function Login() {
  return (
    <Screen title="Sign in">
      <Button title="Use Quick Connect" variant="secondary" onPress={() => router.push('/quick-connect')} />
    </Screen>
  );
}
