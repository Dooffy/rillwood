// SPDX-License-Identifier: GPL-3.0-or-later
import { Page } from '@/components/Page';
import { LicencesSettings } from '@/components/SettingsPages';

/** Settings → Licences (tablets in landscape show it beside Settings instead). */
export default function Licences() {
  return (
    <Page>
      <LicencesSettings />
    </Page>
  );
}
