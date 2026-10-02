// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';
import { Appearance as RNAppearance } from 'react-native';

import { ToastProvider } from '@/components/Toast';
import { setAppearance } from '@/settings';

import { PrimitivesPreview } from './PrimitivesPreview';

async function renderPreview() {
  await render(
    <ToastProvider>
      <PrimitivesPreview />
    </ToastProvider>,
  );
}

describe('PrimitivesPreview', () => {
  beforeEach(() => {
    Storage.clearSync();
    jest.spyOn(RNAppearance, 'setColorScheme').mockImplementation(() => {});
    setAppearance('system');
  });

  it('switches and saves the appearance', async () => {
    await renderPreview();
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(Storage.getItemSync('settings.appearance')).toBe('dark');
    expect(RNAppearance.setColorScheme).toHaveBeenLastCalledWith('dark');
  });

  it('shows a toast from the primary button', async () => {
    await renderPreview();
    await fireEvent.press(screen.getByRole('button', { name: 'Primary' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Primary pressed');
  });
});
