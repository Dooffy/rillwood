// SPDX-License-Identifier: GPL-3.0-or-later
import { Redirect } from 'expo-router';

import { useAccounts } from '@/auth';

/** Launch: signed in → Home, signed out → Add server. */
export default function Index() {
  const { active } = useAccounts();
  return <Redirect href={active ? '/home' : '/server'} />;
}
