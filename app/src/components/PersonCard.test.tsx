// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { PersonCard } from './PersonCard';

describe('PersonCard', () => {
  it('reads name and role, with the photo', async () => {
    await render(<PersonCard name="Halina Reijn" role="Sintel (voice)" image="https://jf.example.com/p.jpg" />);
    expect(screen.getByLabelText('Halina Reijn, Sintel (voice)')).toBeOnTheScreen();
    expect(screen.getByTestId('avatar-image', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('shows initials and only the name without a role or photo', async () => {
    await render(<PersonCard name="Colin Levy" />);
    expect(screen.getByLabelText('Colin Levy')).toBeOnTheScreen();
    expect(screen.getByText('CL', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
