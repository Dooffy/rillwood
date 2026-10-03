// SPDX-License-Identifier: GPL-3.0-or-later
// Shared image box for PosterCard / LandscapeCard: cached image, placeholder when missing or failed (Jellyfin
// returns 404 for a missing image type), watched check, and progress bar over a bottom fade so it reads on bright art.
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { onArtwork, radii, spacing, type, useColors } from '@/theme';

import { formatRemaining } from '@/format';

import { isInProgress, ProgressBar } from './ProgressBar';
import { Text } from './Text';

export type ArtworkProps = {
  /** Image URL; missing or failing → placeholder. */
  image?: string;
  /** Width / height, e.g. 2 / 3 for posters. */
  aspectRatio: number;
  /** 0-1 watched progress; shown only when between 0 and 1. */
  progress?: number;
  /** Seconds left, shown after the bar as "32m". */
  remainingSeconds?: number;
  played?: boolean;
};

export function Artwork({ image, aspectRatio, progress, remainingSeconds, played = false }: ArtworkProps) {
  const c = useColors();
  const [failed, setFailed] = useState<string>();
  const showImage = image !== undefined && failed !== image;
  const remaining = remainingSeconds === undefined ? undefined : formatRemaining(remainingSeconds);

  return (
    <View style={[styles.box, { aspectRatio, backgroundColor: c.surface }]}>
      {showImage ? (
        <Image
          testID="artwork-image"
          source={image}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={150}
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(image)}
          accessible={false}
        />
      ) : (
        <View testID="artwork-placeholder" style={[StyleSheet.absoluteFill, styles.center]}>
          <SymbolView name={{ ios: 'film', android: 'movie' }} tintColor={c.iconInactive} size={28} />
        </View>
      )}
      {played && (
        <View testID="artwork-played" style={styles.check}>
          <SymbolView name={{ ios: 'checkmark', android: 'check' }} tintColor={onArtwork.fill} size={12} />
        </View>
      )}
      {isInProgress(progress, played) && (
        <>
          <View testID="artwork-fade" style={styles.fade} />
          <View style={styles.progress}>
            <View style={styles.bar}>
              <ProgressBar progress={progress} overArtwork />
            </View>
            {remaining !== undefined && (
              <Text variant="caption" style={styles.remaining} numberOfLines={1}>
                {remaining}
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', borderRadius: radii.card, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  check: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: onArtwork.scrim,
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', backgroundImage: onArtwork.fade },
  progress: {
    position: 'absolute',
    left: spacing.sm + 2,
    right: spacing.sm + 2,
    bottom: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bar: { flex: 1 },
  remaining: { color: onArtwork.fill, fontWeight: type.label.fontWeight, fontVariant: ['tabular-nums'] },
});
