// SPDX-License-Identifier: GPL-3.0-or-later
// One option's checkmark list (Settings, Settings → Subtitles), plus a related one under it (`more`); the title comes
// from the root layout.
import { useLocalSearchParams } from 'expo-router';

import { Message } from '@/components/Message';
import { OptionList } from '@/components/OptionList';
import { Page } from '@/components/Page';
import { SubtitlePreview } from '@/components/SubtitlePreview';
import { isPickerKey, usePicker, type PickerKey } from '@/pickers';

export default function Option() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { picker, value } = usePicker(isPickerKey(key) ? key : undefined);
  // A link to an option this version doesn't have.
  if (!picker || value === undefined) return <Message fill text="This setting isn't available." />;
  return (
    <Page>
      {picker.preview && <SubtitlePreview />}
      <OptionList
        title={picker.more ? picker.section : undefined}
        choices={picker.choices}
        value={value}
        onChange={picker.set}
        footer={picker.footer}
      />
      {isPickerKey(picker.more) && <MoreOption option={picker.more} />}
    </Page>
  );
}

/** A second option on the same page, under its section header. */
function MoreOption({ option }: { option: PickerKey }) {
  const { picker, value } = usePicker(option);
  if (!picker || value === undefined) return null;
  return (
    <OptionList
      title={picker.section ?? picker.title}
      choices={picker.choices}
      value={value}
      onChange={picker.set}
      footer={picker.footer}
    />
  );
}
