// SPDX-License-Identifier: GPL-3.0-or-later
import { useLocalSearchParams } from 'expo-router';

import { KidsAccountSettings } from '@/components/KidsSettingsPages';
import { Page } from '@/components/Page';

/** Account → Kids account: On / Off. Tablets in landscape show it beside Settings instead. */
export default function KidsAccount() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Page>
      <KidsAccountSettings id={id} />
    </Page>
  );
}
