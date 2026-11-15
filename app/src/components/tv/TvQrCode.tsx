// SPDX-License-Identifier: GPL-3.0-or-later
// A link as a QR code for a phone to scan (Apple TV has no browser): dark modules on a white tile with the 4-module
// quiet zone, the title over it and the address under it (for typing when the camera won't read it). Drawn from plain
// views - one per dark run in a row - from our own encoder (`src/qr.ts`).
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { qrCode } from '@/qr';
import { radii, tv } from '@/theme';

import { Text } from '../Text';

/** The light border every QR code needs around it (ISO/IEC 18004), in modules. */
const QUIET = 4;

/** Dark runs in a row: [start, length]. */
function runs(row: boolean[]): [number, number][] {
  const out: [number, number][] = [];
  row.forEach((dark, x) => {
    if (!dark) return;
    const last = out.at(-1);
    if (last && last[0] + last[1] === x) last[1]++;
    else out.push([x, 1]);
  });
  return out;
}

export function TvQrCode({ title, url, size = tv.settings.qr.size }: { title: string; url: string; size?: number }) {
  const rows = useMemo(() => qrCode(url).map(runs), [url]);
  const count = rows.length + QUIET * 2;
  // Whole points per module: crisp edges.
  const module = Math.max(1, Math.floor(size / count));
  const side = module * count;
  const display = url.replace(/^https:\/\//, '');
  return (
    <View style={styles.root} accessible accessibilityLabel={`${title}, QR code: ${display}`}>
      <Text style={tv.type.button}>{title}</Text>
      <View testID="tv-qr" style={[styles.tile, { width: side, height: side, padding: module * QUIET }]}>
        {rows.map((row, y) => (
          <View key={y} style={{ height: module }}>
            {row.map(([x, length]) => (
              <View key={x} style={[styles.module, { left: x * module, width: length * module, height: module }]} />
            ))}
          </View>
        ))}
      </View>
      <Text secondary style={[tv.type.small, styles.url, { maxWidth: side }]}>
        {display}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: tv.gap.sm },
  tile: { backgroundColor: tv.settings.qr.light, borderRadius: radii.card },
  module: { position: 'absolute', top: 0, backgroundColor: tv.settings.qr.dark },
  url: { textAlign: 'center' },
});
