// SPDX-License-Identifier: GPL-3.0-or-later
// Settings options that open a checkmark list (`/option/[key]`, iOS Settings style): the row shows the current choice,
// the list saves a tap. One entry per option: its title, choices and where the value lives (`src/settings.ts`).
import { useSyncExternalStore } from 'react';

import {
  APPEARANCE_OPTIONS,
  DOWNLOAD_NETWORK_OPTIONS,
  getAppearance,
  getDownloadNetwork,
  getSubtitleSample,
  getSubtitleScale,
  getSubtitleStyle,
  setAppearance,
  setDownloadNetwork,
  setSubtitleSample,
  setSubtitleScale,
  setSubtitleStyle,
  subscribeSettings,
  SUBTITLE_COLORS,
  SUBTITLE_EDGES,
  SUBTITLE_FONTS,
  SUBTITLE_SAMPLES,
  SUBTITLE_SIZES,
  subtitleFontFamily,
} from '@/settings';

type Value = string | number;

export type OptionChoice<T extends Value = Value> = {
  value: T;
  label: string;
  /** Colour dot before the label (colour presets). */
  swatch?: string;
  /** Label drawn in this face (typefaces). */
  fontFamily?: string;
};

export type OptionPicker<T extends Value = Value> = {
  title: string;
  choices: readonly OptionChoice<T>[];
  get(): T;
  set(value: T): void;
  /** Subtitle preview above the list. */
  preview?: boolean;
  footer?: string;
};

// Checks each entry against its own value type (choices, get and set agree), then files it under the common shape.
const option = <T extends Value>(picker: OptionPicker<T>) => picker as unknown as OptionPicker;

export const PICKERS = {
  appearance: option({
    title: 'Appearance',
    choices: APPEARANCE_OPTIONS,
    get: getAppearance,
    set: setAppearance,
    footer: "System follows the phone's setting.",
  }),
  'subtitle-size': option({
    title: 'Size',
    choices: SUBTITLE_SIZES,
    get: getSubtitleScale,
    set: setSubtitleScale,
    preview: true,
  }),
  'subtitle-font': option({
    title: 'Font',
    choices: SUBTITLE_FONTS.map((o) => ({ ...o, fontFamily: subtitleFontFamily(o.value) })),
    get: () => getSubtitleStyle().font,
    set: (font) => setSubtitleStyle({ font }),
    preview: true,
  }),
  'subtitle-colour': option({
    title: 'Colour',
    choices: SUBTITLE_COLORS.map((o) => ({ ...o, swatch: o.value })),
    get: () => getSubtitleStyle().color,
    set: (color) => setSubtitleStyle({ color }),
    preview: true,
  }),
  'subtitle-edge': option({
    title: 'Edge',
    choices: SUBTITLE_EDGES,
    get: () => getSubtitleStyle().edge,
    set: (edge) => setSubtitleStyle({ edge }),
    preview: true,
  }),
  'subtitle-sample': option({
    title: 'Preview text',
    choices: SUBTITLE_SAMPLES,
    get: getSubtitleSample,
    set: setSubtitleSample,
    preview: true,
    footer: 'Only for this preview. Subtitles play in the language of the track you pick.',
  }),
  'download-network': option({
    title: 'Network',
    choices: DOWNLOAD_NETWORK_OPTIONS,
    get: getDownloadNetwork,
    set: setDownloadNetwork,
    footer:
      "Wi-Fi only doesn't use mobile data or a personal hotspot. Files that are downloading when you change this start over.",
  }),
};

export type PickerKey = keyof typeof PICKERS;

export const isPickerKey = (key: unknown): key is PickerKey => typeof key === 'string' && Object.hasOwn(PICKERS, key);

/** Header title for `/option/[key]` (root layout). */
export const pickerTitle = (params: unknown) => {
  const key = (params as { key?: unknown } | undefined)?.key;
  return isPickerKey(key) ? PICKERS[key].title : '';
};

const none = () => undefined;

/** The option's current value and choice (none for an unknown key); re-renders when the value changes. */
export function usePicker(key: PickerKey | undefined) {
  const picker = key ? PICKERS[key] : undefined;
  const value = useSyncExternalStore(subscribeSettings, picker?.get ?? none);
  return { picker, value, choice: picker?.choices.find((c) => c.value === value) };
}
