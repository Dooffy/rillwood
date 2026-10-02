// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders an accessible loading indicator', async () => {
    await render(<Spinner />);
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
  });

  it('fills its parent when asked', async () => {
    await render(<Spinner fill />);
    expect(screen.getByTestId('spinner')).toHaveStyle({ flex: 1 });
  });
});
