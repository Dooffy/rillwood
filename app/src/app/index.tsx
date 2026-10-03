// SPDX-License-Identifier: GPL-3.0-or-later
import { Redirect } from 'expo-router';

import { useSession } from '@/session';

/** Launch: signed in → Home; otherwise Welcome (onboarding, with saved accounts one tap away). */
export default function Index() {
  const { active } = useSession();
  return <Redirect href={active ? '/home' : '/welcome'} />;
}
