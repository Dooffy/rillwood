// SPDX-License-Identifier: GPL-3.0-or-later
import { AccountsSection } from '@/components/AccountList';
import { Message } from '@/components/Message';
import { Page } from '@/components/Page';
import { useSession } from '@/session';

/** Saved accounts while signed out (Welcome → Use a saved account): the same list as Settings. */
export default function Accounts() {
  const { accounts } = useSession();
  return (
    <Page narrow>
      {/* The last saved one removed from its details. */}
      {accounts.length === 0 && <Message text="No saved accounts. Add one to sign in." />}
      <AccountsSection />
    </Page>
  );
}
