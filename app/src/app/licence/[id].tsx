// SPDX-License-Identifier: GPL-3.0-or-later
// One entry of Settings → Licences; the title comes from the root layout.
import { useLocalSearchParams } from 'expo-router';

import { Page } from '@/components/Page';
import { LicenceSettings } from '@/components/SettingsPages';

export default function Licence() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Page>
      <LicenceSettings id={Number(id)} />
    </Page>
  );
}
