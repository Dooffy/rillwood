// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PHONE, resetDevice, setDevice, TABLET_PORTRAIT } from '@/testDevice';

import { PERSON_SIZE, PersonCard, WIDE_PERSON_SIZE } from './PersonCard';

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

  it('has bigger photos on tablets', async () => {
    const width = () => StyleSheet.flatten(screen.getByLabelText('Colin Levy').props.style).width;
    await setDevice(...PHONE);
    await render(<PersonCard name="Colin Levy" />);
    expect(width()).toBe(PERSON_SIZE + 16);
    await setDevice(...TABLET_PORTRAIT);
    expect(width()).toBe(WIDE_PERSON_SIZE + 16);
    resetDevice();
  });
});
