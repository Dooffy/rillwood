// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';

import Subtitles from '@/app/subtitles';
import { DEFAULT_SUBTITLE_STYLE, setSubtitleSample, setSubtitleScale, setSubtitleStyle } from '@/settings';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const row = (name: string) => screen.getByRole('button', { name });

describe('Subtitles screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.clearSync();
    setSubtitleScale(1);
    setSubtitleStyle(DEFAULT_SUBTITLE_STYLE);
    setSubtitleSample('en');
  });

  it('shows the preview and each option with its saved value', async () => {
    setSubtitleScale(1.5);
    setSubtitleStyle({ font: 'serif', color: '#4DD0E1', edge: 'shadow' });
    await render(<Subtitles />);
    expect(screen.getByTestId('subtitle-preview')).toBeOnTheScreen();
    expect(row('Size')).toHaveAccessibilityValue({ text: 'Extra large' });
    expect(row('Font')).toHaveAccessibilityValue({ text: 'Serif' });
    expect(row('Colour')).toHaveAccessibilityValue({ text: 'Cyan' });
    expect(row('Edge')).toHaveAccessibilityValue({ text: 'Shadow' });
    expect(row('Preview text')).toHaveAccessibilityValue({ text: 'English' });
  });

  it('opens each option list', async () => {
    await render(<Subtitles />);
    for (const [name, key] of [
      ['Size', 'subtitle-size'],
      ['Font', 'subtitle-font'],
      ['Colour', 'subtitle-colour'],
      ['Edge', 'subtitle-edge'],
      ['Preview text', 'subtitle-sample'],
    ]) {
      await fireEvent.press(row(name));
      expect(router.push).toHaveBeenLastCalledWith({ pathname: '/option/[key]', params: { key } });
    }
  });
});
