// SPDX-License-Identifier: GPL-3.0-or-later
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';

import { Button } from './Button';
import { IconButton } from './IconButton';
import { SOON, useToast } from './Toast';

export type DetailActionsProps = {
  /** "Play", "Resume", "Resume S1:E2". */
  playTitle: string;
  /** undefined: nothing to play yet (button disabled). */
  onPlay?: () => void;
  /** Shown under the row when set (in progress): "Play from Start". */
  onStartOver?: () => void;
  played?: boolean;
};

/** Play capsule with round watched + favourite buttons (placeholders until mark watched / favourite land). */
export function DetailActions({ playTitle, onPlay, onStartOver, played = false }: DetailActionsProps) {
  const toast = useToast();
  return (
    <View style={styles.actions}>
      <View style={styles.row}>
        <View style={styles.play}>
          <Button
            title={playTitle}
            icon={{ ios: 'play.fill', android: 'play_arrow' }}
            disabled={!onPlay}
            onPress={() => onPlay?.()}
          />
        </View>
        <IconButton
          icon={{ ios: played ? 'checkmark.circle.fill' : 'checkmark', android: 'check' }}
          label={played ? 'Watched' : 'Mark as watched'}
          onPress={() => toast(SOON)}
        />
        <IconButton
          icon={{ ios: 'heart', android: 'favorite' }}
          label="Add to favourites"
          onPress={() => toast(SOON)}
        />
      </View>
      {onStartOver && <Button title="Play from Start" variant="secondary" onPress={onStartOver} />}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  play: { flex: 1 },
});
