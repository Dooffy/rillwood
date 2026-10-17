// SPDX-License-Identifier: GPL-3.0-or-later
import { Page } from '@/components/Page';
import { StorageSettings } from '@/components/SettingsPages';

/** Settings → Storage limit (tablets in landscape show it beside Settings instead). */
export default function DownloadStorage() {
  return (
    <Page>
      <StorageSettings />
    </Page>
  );
}
