// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback } from 'react';
import { PixelRatio } from 'react-native';

import { imageUrl, type ImageRef } from '@/items';
import { useSession } from '@/session';

/** Image URL builder for the active server: `(ref, width in points)` → URL sized for this screen, or undefined. */
export function useImage() {
  const { active } = useSession();
  const baseUrl = active?.server.url;
  const scale = PixelRatio.get();
  // Stable per server + scale, so list cells built with it can skip re-rendering.
  return useCallback(
    (ref: ImageRef | undefined, width: number) => (baseUrl && ref ? imageUrl(baseUrl, ref, width, scale) : undefined),
    [baseUrl, scale],
  );
}
