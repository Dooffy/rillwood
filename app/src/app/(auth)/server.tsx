// SPDX-License-Identifier: GPL-3.0-or-later
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';

export default function Server() {
  return (
    <Screen title="Add server">
      <Text secondary>Enter your Jellyfin server address.</Text>
    </Screen>
  );
}
