// SPDX-License-Identifier: GPL-3.0-or-later
import { Button } from '@/components/Button';
import { Page } from '@/components/Page';
import { WhereToFindServer } from '@/components/ServerHelp';
import { StepPills } from '@/components/StepPills';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useOnboarding } from '@/navigation';
import { ONBOARDING_STEPS } from '@/server';
import { useServerConnect } from '@/useServerConnect';

/**
 * Add server with where to find the address. From Welcome (`onboarding=1`) it is also step 1 of 2 with an
 * intro; from Add account it skips the steps.
 */
export default function Server() {
  const onboarding = useOnboarding();
  const { address, editAddress, error, loading, connect } = useServerConnect(onboarding);

  return (
    <Page form busy={loading}>
      {onboarding && <StepPills steps={ONBOARDING_STEPS} current={0} />}
      <Text secondary>
        {onboarding && 'Rillwood plays your own Jellyfin library. '}Enter the address you use to open Jellyfin in a
        browser.
      </Text>
      <TextField
        label="Server address"
        placeholder="https://jellyfin.example.com"
        value={address}
        onChangeText={editAddress}
        error={error}
        keyboardType="url"
        textContentType="URL"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={connect}
        editable={!loading}
      />
      <WhereToFindServer />
      <Button title="Continue" onPress={connect} loading={loading} disabled={address.trim() === ''} />
    </Page>
  );
}
