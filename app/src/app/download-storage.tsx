// SPDX-License-Identifier: GPL-3.0-or-later
// Settings → Storage limit: most space downloads may take on this phone, every account together. Checked when a
// download starts (docs/context/downloads.md); what's already downloaded stays.
import { Paths } from 'expo-file-system';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Page } from '@/components/Page';
import { StepSlider } from '@/components/StepSlider';
import { Text } from '@/components/Text';
import { downloadsSize, useDownloadList } from '@/downloads';
import { formatBytes } from '@/format';
import {
  downloadLimitStep,
  downloadLimitSteps,
  formatDownloadLimit,
  setDownloadLimit,
  useDownloadLimit,
} from '@/settings';
import { spacing } from '@/theme';

export default function DownloadStorage() {
  const limit = useDownloadLimit();
  // totalDiskSpace is a native call: once per screen, not on every drag frame.
  const steps = useMemo(() => downloadLimitSteps(Paths.totalDiskSpace), []);
  const stop = downloadLimitStep(steps, limit);
  const used = downloadsSize(useDownloadList());

  return (
    <Page>
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
    </Page>
  );
}

const styles = StyleSheet.create({
  slider: { paddingTop: spacing.md },
  footer: { paddingHorizontal: spacing.md },
});
