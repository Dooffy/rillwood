// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { StorageBar } from './StorageBar';

describe('StorageBar', () => {
  it('shows downloads against free space', async () => {
    await render(<StorageBar used={30e9} free={90e9} />);
    expect(screen.getByLabelText('Downloads 30 GB · 90 GB free')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-fill')).toBeOnTheScreen();
  });

  it('shows only the downloads until free space is known', async () => {
    await render(<StorageBar used={4.2e9} />);
    expect(screen.getByLabelText('Downloads 4.2 GB')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-fill')).toBeNull();
  });
});
