// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV offline state (screen draft 14): the server out of reach - a big wifi icon, which server, what to check,
// Try Again (focus) and Switch Account. `Offline` hands off to it on TV. The app rechecks on its own while offline
// (`src/connection.ts`) and failed screens reload once the server answers, so the copy says it keeps trying.
import { router } from 'expo-router';

import { useSession } from '@/session';

import { TvButton } from './TvButton';
import { TvEmptyState } from './TvEmptyState';

export type TvOfflineProps = {
  retry: () => void;
  /** A retry is running: Try Again spins. */
  busy?: boolean;
  /** Nothing else on screen: centred up and down. */
  fill?: boolean;
};

export function TvOffline({ retry, busy = false, fill = false }: TvOfflineProps) {
  const server = useSession().active?.server.name ?? 'the server';
  return (
    <TvEmptyState
      testID="offline"
      alert
      fill={fill}
      icon="wifi.slash"
      title={`Can't reach ${server}`}
      text="Check that the server is on and this Apple TV is on the same network. Rillwood keeps trying."
    >
      <TvButton variant="primary" title="Try Again" loading={busy} onPress={retry} preferredFocus />
      <TvButton title="Switch Account" onPress={() => router.push('/accounts')} />
    </TvEmptyState>
  );
}
