// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import type { UserFlag } from '@/items';
import { spacing } from '@/theme';
import { downloadActions, useDownloadControl } from '@/useDownloadControl';

import { ActionSheet } from './ActionSheet';
import { Chip } from './Chip';
import { IconButton } from './IconButton';

/**
 * A pill per season (one tap switches, the row scrolls sideways when there are many) and ⋯ with the shown season's
 * actions: Mark as Watched / Unwatched, then its download (Download, Pause, Resume, Cancel, Delete). `download`: the
 * shown season as the downloader needs it (with its series id). Owns its menu state: opening it re-renders only this.
 */
export function SeasonPills({
  seasons,
  value,
  download,
  onChange,
  onMark,
}: {
  seasons: BaseItemDto[];
  value?: string;
  download?: BaseItemDto;
  onChange: (seasonId: string) => void;
  /** Mark the shown season watched / unwatched. */
  onMark: (season: BaseItemDto, flag: UserFlag, value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const control = useDownloadControl(download);
  const current = seasons.find((s) => s.Id === value);
  const played = current?.UserData?.Played === true;

  return (
    <View style={styles.row}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {seasons.map((s) => (
          <Chip key={s.Id} label={s.Name} selected={s.Id === value} onPress={() => onChange(s.Id)} />
        ))}
      </ScrollView>
      {current && (
        <IconButton
          icon={{ ios: 'ellipsis', android: 'more_horiz' }}
          label={`More for ${current.Name}`}
          onPress={() => setOpen(true)}
        />
      )}
      {current && (
        <ActionSheet
          visible={open}
          title={current.Name}
          actions={[
            {
              label: `Mark ${current.Name} as ${played ? 'Unwatched' : 'Watched'}`,
              onPress: () => onMark(current, 'played', !played),
            },
            // The sheet's title names the season.
            ...downloadActions(control),
          ]}
          onClose={() => setOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pills: { gap: spacing.sm, alignItems: 'center' },
});
