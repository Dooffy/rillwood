// SPDX-License-Identifier: GPL-3.0-or-later
// Settings on phones and tablets (Apple TV: `TvSettings`).
import { AccountsSection } from '@/components/AccountList';
import { ageLabel, KidsModeCard } from '@/components/KidsSettingsPages';
import { ListRow, ListSection } from '@/components/List';
import { Page } from '@/components/Page';
import { OptionRow } from '@/components/OptionList';
import { useSettingsLink } from '@/components/SettingsLink';
import { SettingsSplit } from '@/components/SettingsSplit';
import { kidsMode, useKids } from '@/kidsSettings';
import { usePicker } from '@/pickers';
import { useSession } from '@/session';
import { formatDownloadLimit, useDownloadLimit } from '@/settings';
import { kids as kidsTheme, useWideLandscape } from '@/theme';

/** Kids mode for the active account ('off' = the full app); on, Settings was opened through the gate. */
function useKidsModeNow() {
  const { active } = useSession();
  const kids = useKids(active?.id);
  return active ? kidsMode(kids) : 'off';
}

/**
 * Accounts on top (one tap switches), the Kids Mode row (its screen starts kids mode), then app settings. Opened from
 * kids mode on a shared phone: only the Kids Mode card (the kid's filter and the way out - the grown-up turns kids mode
 * off for the rest). A kids account: the card, then the app settings (the device may have no other account to change
 * them from). Tablets in landscape: the page a row opens shows beside it.
 */
export function PhoneSettings() {
  // From kids mode the pane starts empty - no account page there.
  const start = useKidsModeNow() !== 'off' ? null : undefined;
  return useWideLandscape() ? (
    <SettingsSplit start={start}>
      <SettingsList />
    </SettingsSplit>
  ) : (
    <Page>
      <SettingsList />
    </Page>
  );
}

function SettingsList() {
  const { active } = useSession();
  const kids = useKids(active?.id);
  const mode = useKidsModeNow();
  const subtitleSize = usePicker('subtitle-size').choice?.label;
  const subtitleColour = usePicker('subtitle-colour').choice?.label;
  const downloadLimit = useDownloadLimit();
  const link = useSettingsLink();

  // Shared phone in kids mode (gate → Settings): only the card - the kid's filter and the way out. The rest is
  // device-wide: it waits in the full app.
  if (mode === 'shared') return <KidsModeCard />;

  const subtitles = { page: 'subtitles' } as const;
  const storage = { page: 'storage' } as const;
  const aboutPage = { page: 'about' } as const;
  const kidsPage = { page: 'kids-mode' } as const;

  const display = (
    <ListSection title="Display">
      <OptionRow option="appearance" />
      <ListRow
        label="Subtitles"
        value={`${subtitleSize}, ${subtitleColour}`}
        selected={link.selected(subtitles)}
        onPress={() => link.open(subtitles)}
      />
    </ListSection>
  );
  const playback = (
    <ListSection title="Playback">
      <OptionRow option="autoplay-next" />
      <OptionRow option="audio-language" />
      {/* Subtitle language sits on the same page, under the mode. */}
      <OptionRow option="subtitle-mode" />
    </ListSection>
  );
  const downloads = (
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
  );

  const about = (
    <ListSection title="About">
      <ListRow label="About Rillwood" selected={link.selected(aboutPage)} onPress={() => link.open(aboutPage)} />
    </ListSection>
  );

  // A kids account (gate → Settings): the card (its way out), then the app settings - no accounts, no Kids Mode row.
  if (mode === 'account')
    return (
      <>
        <KidsModeCard />
        {display}
        {playback}
        {downloads}
        {about}
      </>
    );

  return (
    <>
      <AccountsSection />
      {/* The way in: a row to the Kids Mode screen (its card: age, unrated, Start). */}
      {active && (
        <ListSection>
          <ListRow
            label="Kids Mode"
            emoji={kidsTheme.emoji.mode}
            detail="Hand your phone to a kid"
            value={ageLabel(kids.age)}
            selected={link.selected(kidsPage)}
            onPress={() => link.open(kidsPage)}
          />
        </ListSection>
      )}
      {display}
      {playback}
      {downloads}
      {about}
    </>
  );
}
