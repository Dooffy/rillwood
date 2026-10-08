// SPDX-License-Identifier: GPL-3.0-or-later
import { Message } from '@/components/Message';
import { Screen } from '@/components/Screen';

export default function Downloads() {
  return (
    <Screen title="Downloads">
      <Message text="No downloads yet. Downloading comes in a later build." />
    </Screen>
  );
}
