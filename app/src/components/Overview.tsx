// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import { Pressable } from 'react-native';

import { Text } from './Text';

/** Longer overviews start clamped (3 lines unless `lines` says otherwise) with More. */
const CLAMP_CHARS = 150;

/** Overview text; long ones toggle More / Less on tap. Own state: a tap re-renders only this. */
export function Overview({ text, lines = 3 }: { text: string; lines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const clampable = text.length > CLAMP_CHARS;
  return (
    <Pressable
      disabled={!clampable}
      accessibilityRole={clampable ? 'button' : undefined}
      accessibilityHint={clampable ? (expanded ? 'Shows less' : 'Shows the whole overview') : undefined}
      accessibilityState={clampable ? { expanded } : undefined}
      onPress={() => setExpanded((e) => !e)}
    >
      <Text numberOfLines={clampable && !expanded ? lines : undefined}>{text}</Text>
      {clampable && (
        <Text variant="label" secondary>
          {expanded ? 'Less' : 'More'}
        </Text>
      )}
    </Pressable>
  );
}
