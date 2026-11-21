// SPDX-License-Identifier: GPL-3.0-or-later
import { WhoIsItFor } from '@/components/KidsSettingsPages';
import { Page } from '@/components/Page';

/** "Who's it for?" after signing in a user the server limits (`finishSignIn`); phones and tablets. */
export default function KidsSetup() {
  return (
    <Page narrow>
      <WhoIsItFor />
    </Page>
  );
}
