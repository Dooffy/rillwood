// SPDX-License-Identifier: GPL-3.0-or-later
import { KidsModeCard } from '@/components/KidsSettingsPages';
import { Page } from '@/components/Page';

/** Settings → Kids Mode: age, unrated, Start. Tablets in landscape show it beside Settings instead. */
export default function KidsMode() {
  return (
    <Page>
      <KidsModeCard />
    </Page>
  );
}
