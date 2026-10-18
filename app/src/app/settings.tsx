// SPDX-License-Identifier: GPL-3.0-or-later
import Constants from 'expo-constants';

import { AccountsSection } from '@/components/AccountList';
import { ListRow, ListSection } from '@/components/List';
import { Page } from '@/components/Page';
import { OptionRow } from '@/components/OptionList';
import { useSettingsLink } from '@/components/SettingsLink';
import { SettingsSplit } from '@/components/SettingsSplit';
import { usePicker } from '@/pickers';
import { formatDownloadLimit, useDownloadLimit } from '@/settings';
import { useWideLandscape } from '@/theme';

/** Accounts on top (one tap switches), then app settings. Tablets in landscape: the page a row opens shows beside it. */
export default function Settings() {
  return useWideLandscape() ? (
    <SettingsSplit>
      <SettingsList />
    </SettingsSplit>
  ) : (
    <Page>
      <SettingsList />
    </Page>
  );
}

function SettingsList() {
  const subtitleSize = usePicker('subtitle-size').choice?.label;
  const subtitleColour = usePicker('subtitle-colour').choice?.label;
  const downloadLimit = useDownloadLimit();
  const link = useSettingsLink();
  const subtitles = { page: 'subtitles' } as const;
  const storage = { page: 'storage' } as const;
  const licences = { page: 'licences' } as const;

  return (
    <>
      <AccountsSection />
      <ListSection>
        <OptionRow option="appearance" />
        <ListRow
          label="Subtitles"
          value={`${subtitleSize}, ${subtitleColour}`}
          selected={link.selected(subtitles)}
          onPress={() => link.open(subtitles)}
        />
      </ListSection>
      <ListSection title="Downloads">
        <OptionRow option="download-network" />
        <ListRow
          label="Storage limit"
          value={formatDownloadLimit(downloadLimit)}
          selected={link.selected(storage)}
          onPress={() => link.open(storage)}
        />
        {/* Remove watched sits on the same page, under the days. */}
        <OptionRow option="offload-days" />
      </ListSection>
      <ListSection title="About">
        <ListRow label="Version" value={Constants.expoConfig?.version ?? '-'} />
        <ListRow label="Licences" selected={link.selected(licences)} onPress={() => link.open(licences)} />
      </ListSection>
    </>
  );
}
