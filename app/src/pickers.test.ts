// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';

import { isPickerKey, PICKERS, pickerTitle } from './pickers';

describe('option pickers', () => {
  it('knows its keys only', () => {
    expect(isPickerKey('appearance')).toBe(true);
    expect(isPickerKey('constructor')).toBe(false);
    expect(isPickerKey(undefined)).toBe(false);
  });

  it('titles the list screen from the route key', () => {
    expect(pickerTitle({ key: 'subtitle-colour' })).toBe('Colour');
    expect(pickerTitle({ key: 'nope' })).toBe('');
    expect(pickerTitle(undefined)).toBe('');
  });

  it('colour choices carry their swatch', () => {
    expect(PICKERS['subtitle-colour'].choices.every((c) => c.swatch === c.value)).toBe(true);
  });
});
