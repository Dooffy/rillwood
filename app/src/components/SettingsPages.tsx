// SPDX-License-Identifier: GPL-3.0-or-later
// Settings subpages, each its own screen on phones (`/subtitles`, `/option/[key]`, `/download-storage`,
// `/licence/[id]`; the Licences list is `LicencesList`) and the pane
// beside Settings on tablets (`SettingsSplit`).
import { Paths } from 'expo-file-system';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { downloadsSize, useDownloadList } from '@/downloads';
import { formatBytes } from '@/format';
import { licenceById } from '@/licences';
import { isPickerKey, usePicker, type PickerKey } from '@/pickers';
import {
  downloadLimitStep,
  downloadLimitSteps,
  formatDownloadLimit,
  setDownloadLimit,
  useDownloadLimit,
} from '@/settings';
import { spacing } from '@/theme';

import { ListRow, ListSection } from './List';
import { Message } from './Message';
import { OptionList, OptionRow } from './OptionList';
import { StepSlider } from './StepSlider';
import { SubtitlePreview } from './SubtitlePreview';
import { Text } from './Text';

/**
 * Settings → Subtitles: how subtitles look, on this phone for every account. Each row opens its checkmark list with the
 * preview on top. The player menu only picks the track and its timing.
 */
export function SubtitlesSettings() {
  return (
    <>
      <SubtitlePreview />
      <ListSection footer="Applies to text subtitles (SRT, VTT). Styled (ASS) and picture (PGS) subtitles keep their own look.">
        <OptionRow option="subtitle-size" />
        <OptionRow option="subtitle-font" />
        <OptionRow option="subtitle-colour" />
        <OptionRow option="subtitle-edge" />
      </ListSection>
      <ListSection>
        <OptionRow option="subtitle-sample" />
      </ListSection>
    </>
  );
}

/** One option's checkmark list (Settings, Settings → Subtitles), plus a related one under it (`more`). */
export function OptionSettings({ option }: { option: PickerKey }) {
  const { picker, value } = usePicker(option);
  if (!picker || value === undefined) return <Message fill text="This setting isn't available." />;
  return (
    <>
      {picker.preview && <SubtitlePreview />}
      <OptionBlock option={option} title={picker.more ? picker.section : undefined} />
      {/* A second option on the same page, under its section header. */}
      {isPickerKey(picker.more) && <OptionBlock option={picker.more} more />}
    </>
  );
}

/** One option's list; `more`: the second one on a page, always under a header. */
function OptionBlock({ option, title, more = false }: { option: PickerKey; title?: string; more?: boolean }) {
  const { picker, value } = usePicker(option);
  if (!picker || value === undefined) return null;
  return (
    <OptionList
      title={more ? (picker.section ?? picker.title) : title}
      choices={picker.choices}
      value={value}
      onChange={picker.set}
      footer={picker.footer}
    />
  );
}

/**
 * Settings → Storage limit: most space downloads may take on this phone, every account together. Checked when a
 * download starts (docs/context/downloads.md); what's already downloaded stays.
 */
export function StorageSettings() {
  const limit = useDownloadLimit();
  // totalDiskSpace is a native call: once per screen, not on every drag frame.
  const steps = useMemo(() => downloadLimitSteps(Paths.totalDiskSpace), []);
  const stop = downloadLimitStep(steps, limit);
  const used = downloadsSize(useDownloadList());

  return (
    <>
      <View style={styles.slider}>
        <StepSlider
          count={steps.length}
          value={stop}
          onChange={(i) => setDownloadLimit(steps[i])}
          // A limit saved on a bigger phone shows as itself until it's moved.
          format={(i) => formatDownloadLimit(i === stop ? limit : steps[i])}
          label="Download storage limit"
          ends={[formatDownloadLimit(steps[0]), formatDownloadLimit(0)]}
        />
      </View>
      <Text variant="caption" secondary style={styles.footer}>
        {`Applies to every account on this phone. Downloads take ${formatBytes(used)} across all accounts, counting files still downloading. A new download doesn't start if it would go over the limit; what's already downloaded stays.`}
      </Text>
    </>
  );
}

/** One entry of Settings → Licences: its licence, source, packages and full licence texts. */
export function LicenceSettings({ id }: { id: number }) {
  const licence = licenceById(id);
  // A link to an entry this build doesn't have.
  if (!licence) return <Message fill text="This licence isn't available." />;
  const { url, note, packages = [], texts } = licence;
  return (
    <>
      <ListSection footer={note}>
        <ListRow label="Licence" value={licence.licence} />
      </ListSection>
      {url && (
        <Text variant="caption" secondary selectable style={styles.footer}>
          {`Source: ${url}`}
        </Text>
      )}
      {packages.length > 1 && (
        <Text variant="caption" secondary selectable style={styles.footer}>
          {`Packages:\n${packages.join('\n')}`}
        </Text>
      )}
      {texts.length === 0 && (
        <Text variant="caption" secondary style={styles.footer}>
          The package ships no licence file.
        </Text>
      )}
      {texts.map((text, i) => (
        <View key={i} style={styles.licenceText}>
          {/* A paragraph per Text: one very long Text can stop drawing on Android. */}
          {text.split(/\n\s*\n/).map((paragraph, j) => (
            <Text key={j} variant="caption" selectable>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  slider: { paddingTop: spacing.md },
  footer: { paddingHorizontal: spacing.md },
  licenceText: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
});
