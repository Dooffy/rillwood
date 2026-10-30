// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import { Pressable } from 'react-native';

import { Text } from './Text';

/** Longer overviews start clamped (3 lines unless `lines` says otherwise) with More. */
const CLAMP_CHARS = 150;

/**
 * Overview text; long ones toggle More / Less on tap. `onMore`: More goes there instead (the detail hero scrolls to
 * Details, which has the whole text). Own state: a tap re-renders only this.
 */
export function Overview({ text, lines = 3, onMore }: { text: string; lines?: number; onMore?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const clampable = text.length > CLAMP_CHARS;
  return (
    <Pressable
      disabled={!clampable}
      accessibilityRole={clampable ? 'button' : undefined}
      accessibilityHint={
        clampable ? (onMore ? 'Shows the details' : expanded ? 'Shows less' : 'Shows the whole overview') : undefined
      }
      accessibilityState={clampable && !onMore ? { expanded } : undefined}
      onPress={() => (onMore ? onMore() : setExpanded((e) => !e))}
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
