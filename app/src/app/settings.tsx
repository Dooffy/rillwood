// SPDX-License-Identifier: GPL-3.0-or-later
import Constants from 'expo-constants';
import { router } from 'expo-router';

import { AccountsSection } from '@/components/AccountList';
import { ListRow, ListSection } from '@/components/List';
import { Page } from '@/components/Page';
import { OptionRow } from '@/components/OptionList';
import { usePicker } from '@/pickers';
import { formatDownloadLimit, useDownloadLimit } from '@/settings';

/** Accounts on top (one tap switches), then app settings. */
export default function Settings() {
  const subtitleSize = usePicker('subtitle-size').choice?.label;
  const subtitleColour = usePicker('subtitle-colour').choice?.label;
  const downloadLimit = useDownloadLimit();

  return (
    <Page>
      <AccountsSection />
      <ListSection>
        <OptionRow option="appearance" />
        <ListRow
          label="Subtitles"
          value={`${subtitleSize}, ${subtitleColour}`}
          onPress={() => router.push('/subtitles')}
        />
      </ListSection>
      <ListSection title="Downloads">
        <OptionRow option="download-network" />
        <ListRow
          label="Storage limit"
          value={formatDownloadLimit(downloadLimit)}
          onPress={() => router.push('/download-storage')}
        />
        {/* Remove watched sits on the same page, under the days. */}
        <OptionRow option="offload-days" />
      </ListSection>
      <ListSection title="About">
        <ListRow label="Version" value={Constants.expoConfig?.version ?? '-'} />
      </ListSection>
    </Page>
  );
}
