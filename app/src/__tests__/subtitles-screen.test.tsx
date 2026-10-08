// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';
import { StyleSheet } from 'react-native';

import Subtitles from '@/app/subtitles';
import {
  DEFAULT_SUBTITLE_STYLE,
  getSubtitleScale,
  getSubtitleStyle,
  setSubtitleScale,
  setSubtitleStyle,
} from '@/settings';

const previewText = (text: RegExp = /Subtitles look like this/) =>
  StyleSheet.flatten(screen.getByText(text).props.style);

/** The preview only draws its text once it knows its height. */
async function renderLaidOut() {
  await render(<Subtitles />);
  await fireEvent(screen.getByTestId('subtitle-preview'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 180 } },
  });
}

describe('Subtitles screen', () => {
  beforeEach(() => {
    Storage.clearSync();
    setSubtitleScale(1);
    setSubtitleStyle(DEFAULT_SUBTITLE_STYLE);
  });

  it('shows the saved choices', async () => {
    setSubtitleScale(1.5);
    setSubtitleStyle({ font: 'serif', color: '#4DD0E1', edge: 'shadow' });
    await renderLaidOut();
    expect(screen.getByRole('radio', { name: 'Extra large' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Serif' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Cyan' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Shadow' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'White' })).not.toBeChecked();
  });

  it('saves each change and shows it in the preview', async () => {
    await renderLaidOut();
    // mpv's 55 at 720 px, on a 180 pt tall preview.
    expect(previewText()).toMatchObject({ fontSize: 13.75, color: '#FFFFFF' });

    await fireEvent.press(screen.getByRole('radio', { name: 'Large' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Mono' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Yellow' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Box' }));

    expect(getSubtitleScale()).toBe(1.25);
    expect(getSubtitleStyle()).toEqual({ font: 'monospace', color: '#FFEB3B', edge: 'box' });
    expect(previewText()).toMatchObject({ fontSize: 17.1875, color: '#FFEB3B' });
    expect(screen.getByRole('radio', { name: 'Box' })).toBeChecked();
  });

  it('previews other scripts without saving them; iOS uses the bundled face for that script', async () => {
    setSubtitleStyle({ font: 'serif' });
    await renderLaidOut();
    expect(previewText()).toMatchObject({ fontFamily: 'NotoSerif-Regular' });
    await fireEvent.press(screen.getByRole('button', { name: '日本語' }));
    expect(screen.getByRole('button', { name: '日本語' })).toBeSelected();
    expect(previewText(/字幕はこのように/)).toMatchObject({ fontFamily: 'NotoSansCJKsc-Regular' });
    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));
    expect(previewText(/هكذا تبدو الترجمة/)).toMatchObject({
      fontFamily: 'NotoSansArabic-Regular',
      writingDirection: 'rtl',
    });
    // Style choices still apply to the sample; the language isn't a setting.
    expect(getSubtitleStyle()).toEqual({ font: 'serif', color: '#FFFFFF', edge: 'outline' });
  });
});
