// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

describe('Index screen', () => {
  it('renders the app name', async () => {
    await render(<Index />);
    expect(screen.getByText('Rillwood')).toBeOnTheScreen();
  });
});
