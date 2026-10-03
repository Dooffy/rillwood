// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { palettes } from '@/theme';

import { StepPills } from './StepPills';

describe('StepPills', () => {
  it('numbers the steps and fills the current one', async () => {
    await render(<StepPills steps={['Server', 'Sign in']} current={1} />);
    expect(screen.getByText('1 Server')).toHaveStyle({ color: palettes.dark.textSecondary });
    expect(screen.getByText('2 Sign in')).toHaveStyle({ color: palettes.dark.onAccent });
    expect(screen.getByTestId('step-active')).toHaveStyle({ backgroundColor: palettes.dark.accent });
  });

  it('announces the position for screen readers', async () => {
    await render(<StepPills steps={['Server', 'Sign in']} current={0} />);
    expect(screen.getByLabelText('Step 1 of 2: Server')).toBeOnTheScreen();
  });
});
