// SPDX-License-Identifier: GPL-3.0-or-later
import { router, useLocalSearchParams } from 'expo-router';

import { AccountDetails } from '@/components/AccountDetails';
import { Page } from '@/components/Page';

/** One account's details (Settings, saved accounts); tablets in landscape show them beside Settings instead. */
export default function Account() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <Page>
      <AccountDetails id={id} onBack={() => router.back()} />
    </Page>
  );
}
