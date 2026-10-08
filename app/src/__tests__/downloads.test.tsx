// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import Downloads from '@/app/(tabs)/downloads';

describe('Downloads', () => {
  it('says what the empty tab means until downloads land (M5)', async () => {
    await render(<Downloads />);
    expect(screen.getByText('No downloads yet. Downloading comes in a later build.')).toBeOnTheScreen();
  });
});
