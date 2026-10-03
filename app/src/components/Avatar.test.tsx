// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { Avatar, initials } from './Avatar';

describe('initials', () => {
  it.each([
    ['anna', 'A'],
    ['Anna Lee', 'AL'],
    ['anna.lee', 'AL'],
    ['Quick Connect user', 'QC'],
    ['  ben  ', 'B'],
    ['', ''],
  ])('%j → %j', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('Avatar', () => {
  it('shows initials in a circle of the given size', async () => {
    await render(<Avatar name="Anna Lee" size={80} />);
    expect(screen.getByText('AL', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('avatar', { includeHiddenElements: true })).toHaveStyle({ width: 80, height: 80 });
  });

  it('falls back to the person icon without a name', async () => {
    await render(<Avatar />);
    expect(screen.queryByText(/./, { includeHiddenElements: true })).toBeNull();
  });
});
