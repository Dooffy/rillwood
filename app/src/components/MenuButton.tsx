// SPDX-License-Identifier: GPL-3.0-or-later
import type { SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';

import { ActionSheet } from './ActionSheet';
import { IconButton } from './IconButton';

export type MenuButtonProps<T extends string> = {
  /** SF Symbol / Material Symbol on the round button. */
  icon: SymbolViewProps['name'];
  /** VoiceOver label of the button: "Sort: Name". */
  label: string;
  /** Heading of the sheet: "Sort by". */
  title: string;
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  /** Filled (accent) when a non-default choice is active, e.g. a filter. */
  active?: boolean;
};

/**
 * Round icon button that opens a sheet of choices (✓ on the current one): sort, filter. Owns its open state, so
 * opening it re-renders only this, not the grid under it.
 */
export function MenuButton<T extends string>({
  icon,
  label,
  title,
  options,
  value,
  onChange,
  active = false,
}: MenuButtonProps<T>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton icon={icon} label={label} variant={active ? 'primary' : 'secondary'} onPress={() => setOpen(true)} />
      <ActionSheet
        visible={open}
        title={title}
        actions={options.map((o) => ({ label: o.label, selected: o.key === value, onPress: () => onChange(o.key) }))}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
