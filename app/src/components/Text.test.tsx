// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { palettes, type } from '@/theme';

import { Text } from './Text';

const colors = palettes.dark; // default palette outside the root layout's provider

describe('Text', () => {
  it('defaults to body in primary text colour', async () => {
    await render(<Text>Hello</Text>);
    expect(screen.getByText('Hello')).toHaveStyle({ ...type.body, color: colors.text });
  });

  it('applies the variant and secondary colour', async () => {
    await render(
      <Text variant="largeTitle" secondary>
        Title
      </Text>,
    );
    expect(screen.getByText('Title')).toHaveStyle({ ...type.largeTitle, color: colors.textSecondary });
  });
});
