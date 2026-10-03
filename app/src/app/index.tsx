// SPDX-License-Identifier: GPL-3.0-or-later
import { Redirect } from 'expo-router';

import { signedOutHome } from '@/navigation';
import { useSession } from '@/session';

/** Launch: signed in → Home; signed out → saved accounts, or Add server on a fresh install. */
export default function Index() {
  const { accounts, active } = useSession();
  return <Redirect href={active ? '/home' : signedOutHome(accounts)} />;
}
