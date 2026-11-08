// SPDX-License-Identifier: GPL-3.0-or-later
import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { launchHref } from '@/navigation';
import { useSession } from '@/session';

/** Launch: signed in → Home (Apple TV with several accounts: Who's Watching); otherwise Welcome. */
export default function Index() {
  return <Redirect href={launchHref(useSession(), Platform.isTV)} />;
}
