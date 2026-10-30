// SPDX-License-Identifier: GPL-3.0-or-later
import { Page } from '@/components/Page';
import { AboutSettings } from '@/components/SettingsPages';

/** Settings → About (tablets in landscape show it beside Settings instead). */
export default function About() {
  return (
    <Page>
      <AboutSettings />
    </Page>
  );
}
