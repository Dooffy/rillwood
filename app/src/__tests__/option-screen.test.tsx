// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Storage } from 'expo-sqlite/kv-store';
import { Appearance as RNAppearance, StyleSheet } from 'react-native';

import Option from '@/app/option/[key]';
import {
  DEFAULT_SUBTITLE_STYLE,
  getSubtitleSample,
  getSubtitleScale,
  getSubtitleStyle,
  setAppearance,
  setSubtitleSample,
  setSubtitleScale,
  setSubtitleStyle,
} from '@/settings';

jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn() }));

const { useLocalSearchParams } = jest.requireMock<{ useLocalSearchParams: jest.Mock }>('expo-router');

const previewText = (text: RegExp = /Subtitles look like this/) =>
  StyleSheet.flatten(screen.getByText(text).props.style);

/** Renders the list for `key`; the preview draws its text once it knows its height. */
async function renderOption(key: string) {
  useLocalSearchParams.mockReturnValue({ key });
  await render(<Option />);
  const preview = screen.queryByTestId('subtitle-preview');
  if (preview) {
    await fireEvent(preview, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 180 } } });
  }
}

describe('Option screen', () => {
  beforeEach(() => {
    Storage.clearSync();
    jest.spyOn(RNAppearance, 'setColorScheme').mockImplementation(() => {});
    setAppearance('system');
    setSubtitleScale(1);
    setSubtitleStyle(DEFAULT_SUBTITLE_STYLE);
    setSubtitleSample('en');
  });

  it('appearance: checks the saved choice, a tap saves and applies it', async () => {
    await renderOption('appearance');
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.getByText("System follows the phone's setting.")).toBeOnTheScreen();
    expect(screen.queryByTestId('subtitle-preview')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System' })).not.toBeChecked();
    expect(Storage.getItemSync('settings.appearance')).toBe('light');
    expect(RNAppearance.setColorScheme).toHaveBeenLastCalledWith('light');
  });

  it('subtitle size: saves and shows it in the preview', async () => {
    await renderOption('subtitle-size');
    // mpv's 55 at 720 px, on a 180 pt tall preview.
    expect(previewText()).toMatchObject({ fontSize: 13.75 });
    await fireEvent.press(screen.getByRole('radio', { name: 'Large' }));
    expect(getSubtitleScale()).toBe(1.25);
    expect(previewText()).toMatchObject({ fontSize: 17.1875 });
  });

  it('subtitle font: labels drawn in their own face', async () => {
    await renderOption('subtitle-font');
    expect(StyleSheet.flatten(screen.getByText('Serif').props.style)).toMatchObject({
      fontFamily: 'NotoSerif-Regular',
    });
    await fireEvent.press(screen.getByRole('radio', { name: 'Mono' }));
    expect(getSubtitleStyle().font).toBe('monospace');
    expect(previewText()).toMatchObject({ fontFamily: 'NotoSansMono-Regular' });
  });

  it('subtitle colour and edge: save and preview', async () => {
    await renderOption('subtitle-colour');
    await fireEvent.press(screen.getByRole('radio', { name: 'Yellow' }));
    expect(previewText()).toMatchObject({ color: '#FFEB3B' });
    await renderOption('subtitle-edge');
    await fireEvent.press(screen.getByRole('radio', { name: 'Box' }));
    expect(getSubtitleStyle()).toEqual({ font: 'sans-serif', color: '#FFEB3B', edge: 'box' });
  });

  it('preview text: other scripts in the bundled iOS face, not saved', async () => {
    setSubtitleStyle({ font: 'serif' });
    await renderOption('subtitle-sample');
    await fireEvent.press(screen.getByRole('radio', { name: '日本語' }));
    expect(getSubtitleSample()).toBe('ja');
    expect(previewText(/字幕はこのように/)).toMatchObject({ fontFamily: 'NotoSansCJKsc-Regular' });
    await fireEvent.press(screen.getByRole('radio', { name: 'العربية' }));
    expect(previewText(/هكذا تبدو الترجمة/)).toMatchObject({
      fontFamily: 'NotoSansArabic-Regular',
      writingDirection: 'rtl',
    });
    expect(getSubtitleStyle()).toEqual({ font: 'serif', color: '#FFFFFF', edge: 'outline' });
  });

  it('an unknown option shows nothing', async () => {
    useLocalSearchParams.mockReturnValue({ key: 'nope' });
    await render(<Option />);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText("This setting isn't available.")).toBeOnTheScreen();
  });
});
