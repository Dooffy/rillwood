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

/** Kids mode is on for the active account: Settings was opened through the gate. */
function useFromKidsMode() {
  const { active } = useSession();
  const kids = useKids(active?.id);
  return active !== null && kidsMode(kids) !== 'off';
}

/**
 * Accounts on top (one tap switches), the Kids Mode row (its screen starts kids mode), then app settings. Opened from
 * kids mode: only the Kids Mode card (the kid's filter and the way out). Tablets in landscape: the page a row opens
 * shows beside it.
 */
export function PhoneSettings() {
  // From kids mode the pane starts empty - no account page there.
  const start = useFromKidsMode() ? null : undefined;
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
  const fromKids = useFromKidsMode();
  const subtitleSize = usePicker('subtitle-size').choice?.label;
  const subtitleColour = usePicker('subtitle-colour').choice?.label;
  const downloadLimit = useDownloadLimit();
  const link = useSettingsLink();

  // Opened from kids mode (gate → Settings): only the card - the kid's filter and the way out. The rest is device-wide
  // (it would change the grown-ups' settings too): it waits in the full app.
  if (fromKids) return <KidsModeCard />;

  const subtitles = { page: 'subtitles' } as const;
  const storage = { page: 'storage' } as const;
  const about = { page: 'about' } as const;
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
      <ListSection title="About">
        <ListRow label="About Rillwood" selected={link.selected(about)} onPress={() => link.open(about)} />
      </ListSection>
    </>
  );
}
