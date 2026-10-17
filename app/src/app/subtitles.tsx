// SPDX-License-Identifier: GPL-3.0-or-later
import { Page } from '@/components/Page';
import { SubtitlesSettings } from '@/components/SettingsPages';

/** Settings → Subtitles (tablets in landscape show it beside Settings instead). */
export default function Subtitles() {
  return (
    <Page>
      <SubtitlesSettings />
    </Page>
  );
}
