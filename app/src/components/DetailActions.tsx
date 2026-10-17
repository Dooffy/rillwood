// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import type { UserFlag } from '@/items';
import { spacing, useWide } from '@/theme';

import { Button } from './Button';
import { IconButton } from './IconButton';

export type DetailActionsProps = {
  /** "Play", "Resume", "Resume S1:E2". */
  playTitle: string;
  /** undefined: nothing to play yet (button disabled). */
  onPlay?: () => void;
  /** Shown under the row when set (in progress): "Play from Start". */
  onStartOver?: () => void;
  played: boolean;
  favourite: boolean;
  /** Watched / favourite tapped: the new value. */
  onMark: (flag: UserFlag, value: boolean) => void;
};

/**
 * Play capsule with round watched + favourite toggles (filled when on; the label says what a tap does). Wide screens:
 * Play as wide as its title, Play from Start a round button in the row - a column-wide capsule would be giant.
 */
export function DetailActions({ playTitle, onPlay, onStartOver, played, favourite, onMark }: DetailActionsProps) {
  const wide = useWide();
  return (
    <View style={styles.actions}>
      <View style={styles.row}>
        <View style={!wide && styles.play}>
          <Button
            title={playTitle}
            icon={{ ios: 'play.fill', android: 'play_arrow' }}
            disabled={!onPlay}
            onPress={() => onPlay?.()}
          />
        </View>
        {wide && onStartOver && (
          <IconButton
            icon={{ ios: 'arrow.counterclockwise', android: 'replay' }}
            label="Play from Start"
            onPress={onStartOver}
          />
        )}
        <IconButton
          icon={{ ios: 'checkmark', android: 'check' }}
          label={played ? 'Mark as unwatched' : 'Mark as watched'}
          selected={played}
          onPress={() => onMark('played', !played)}
        />
        <IconButton
          icon={{ ios: favourite ? 'heart.fill' : 'heart', android: favourite ? 'favorite' : 'favorite_border' }}
          label={favourite ? 'Remove from favourites' : 'Add to favourites'}
          selected={favourite}
          onPress={() => onMark('favourite', !favourite)}
        />
      </View>
      {!wide && onStartOver && <Button title="Play from Start" variant="secondary" onPress={onStartOver} />}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  play: { flex: 1 },
});
