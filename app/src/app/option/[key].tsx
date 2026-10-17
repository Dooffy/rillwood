// SPDX-License-Identifier: GPL-3.0-or-later
// One option's checkmark list; the title comes from the root layout.
import { useLocalSearchParams } from 'expo-router';

import { isPickerKey } from '@/pickers';
import { Message } from '@/components/Message';
import { Page } from '@/components/Page';
import { OptionSettings } from '@/components/SettingsPages';

export default function Option() {
  const { key } = useLocalSearchParams<{ key: string }>();
  // A link to an option this version doesn't have.
  if (!isPickerKey(key)) return <Message fill text="This setting isn't available." />;
  return (
    <Page>
      <OptionSettings option={key} />
    </Page>
  );
}
