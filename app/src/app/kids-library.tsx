// SPDX-License-Identifier: GPL-3.0-or-later
import { KidsLibrarySettings } from '@/components/KidsSettingsPages';
import { Page } from '@/components/Page';

/** Kids Mode → Library: All libraries or one. Tablets in landscape show it beside Settings instead. */
export default function KidsLibrary() {
  return (
    <Page>
      <KidsLibrarySettings />
    </Page>
  );
}
