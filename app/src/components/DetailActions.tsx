// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import type { UserFlag } from '@/items';
import { spacing, useWide } from '@/theme';

import { IconButton } from './IconButton';
import { PlayButton, type PlayButtonProps } from './PlayButton';

/** Wide screens: the play capsule is at least this wide, so a bare "▶ Play" isn't a small button on an iPad. */
export const WIDE_PLAY_MIN_WIDTH = 220;

export type DetailActionsProps = {
  /** The play capsule: what it plays and how far in (`PlayButton`). */
  play: Omit<PlayButtonProps, 'onPress'>;
  /** undefined: nothing to play yet (button disabled). */
  onPlay?: () => void;
  /** In progress: a round "Play from Start" button in the row. */
  onStartOver?: () => void;
  played: boolean;
  favourite: boolean;
  /** Watched / favourite tapped: the new value. */
  onMark: (flag: UserFlag, value: boolean) => void;
};

/**
 * Play capsule (carries the progress) with round Play from Start, watched and favourite buttons (filled when on; the
 * label says what a tap does). Phones: the capsule takes the rest of the row. Wide screens: as wide as its content,
 * at least `WIDE_PLAY_MIN_WIDTH` - a column-wide capsule would be giant.
 */
export function DetailActions({ play, onPlay, onStartOver, played, favourite, onMark }: DetailActionsProps) {
  const wide = useWide();
  return (
    <View style={styles.row}>
      <View testID="play-slot" style={wide ? styles.playWide : styles.play}>
        <PlayButton {...play} onPress={onPlay} />
      </View>
      {onStartOver && (
        <IconButton
          icon={{ ios: 'arrow.counterclockwise', android: 'replay' }}
          label="Play from Start"
          onPress={onStartOver}
        />
      )}
      <IconButton
        icon={{ ios: 'checkmark', android: 'check' }}
        // A toggle: one name, its state from `selected` ("Watched, selected"), not a second time in the label.
        label="Watched"
        selected={played}
        onPress={() => onMark('played', !played)}
      />
      <IconButton
        icon={{ ios: favourite ? 'heart.fill' : 'heart', android: favourite ? 'favorite' : 'favorite_border' }}
        label="Favourite"
        selected={favourite}
        onPress={() => onMark('favourite', !favourite)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  play: { flex: 1 },
  playWide: { minWidth: WIDE_PLAY_MIN_WIDTH },
});
