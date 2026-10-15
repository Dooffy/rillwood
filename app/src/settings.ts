// SPDX-License-Identifier: GPL-3.0-or-later
// User settings in kv-store (CLAUDE.md §2). Read once (sync) on first use, then served from memory.
import { Storage } from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform, Appearance as RNAppearance } from 'react-native';

import type { SubtitleEdge, SubtitleFont, SubtitleStyle, VideoZoom } from '@/player/Player';

export const APPEARANCE_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
] as const;

export type Appearance = (typeof APPEARANCE_OPTIONS)[number]['value'];

// Subtitle appearance (Settings → Subtitles), same for every account. Speed isn't remembered (1× on every open).
// Size = mpv `sub-scale`.
export const SUBTITLE_SIZES = [
  { value: 0.8, label: 'Small' },
  { value: 1, label: 'Medium' },
  { value: 1.25, label: 'Large' },
  { value: 1.5, label: 'Extra large' },
] as const;

export type SubtitleScale = (typeof SUBTITLE_SIZES)[number]['value'];

// Typeface: bundled Noto on iOS, Roboto / Noto Serif / Droid Sans Mono on Android (`modules/mpv` maps them).
export const SUBTITLE_FONTS = [
  { value: 'sans-serif', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Mono' },
] as const satisfies readonly { value: SubtitleFont; label: string }[];

// Presets only, no free picker.
export const SUBTITLE_COLORS = [
  { value: '#FFFFFF', label: 'White' },
  { value: '#FFEB3B', label: 'Yellow' },
  { value: '#4DD0E1', label: 'Cyan' },
  { value: '#69F0AE', label: 'Green' },
] as const;

export const SUBTITLE_EDGES = [
  { value: 'outline', label: 'Outline' },
  { value: 'shadow', label: 'Shadow' },
  { value: 'box', label: 'Box' },
] as const satisfies readonly { value: SubtitleEdge; label: string }[];

// The faces the player uses: bundled Noto on iOS (`app.json`), system families on Android.
const FAMILIES: Record<SubtitleFont, string> = Platform.select({
  ios: { 'sans-serif': 'NotoSans-Regular', serif: 'NotoSerif-Regular', monospace: 'NotoSansMono-Regular' },
  default: { 'sans-serif': 'sans-serif', serif: 'serif', monospace: 'monospace' },
});

/** Sample lines per language. `face`: the bundled iOS font libass falls back to for that script (no Serif / Mono). */
export const SUBTITLE_SAMPLES = [
  { value: 'en', label: 'English', text: 'Subtitles look like this,\non every video.' },
  { value: 'es', label: 'Español', text: 'Así se ven los subtítulos\nen cada vídeo.' },
  { value: 'de', label: 'Deutsch', text: 'So sehen Untertitel aus,\nin jedem Video.' },
  { value: 'fr', label: 'Français', text: 'Voici à quoi ressemblent\nles sous-titres.' },
  { value: 'uk', label: 'Українська', text: 'Так виглядають субтитри\nу кожному відео.' },
  { value: 'ar', label: 'العربية', text: 'هكذا تبدو الترجمة\nفي كل فيديو.', face: 'NotoSansArabic-Regular', rtl: true },
  { value: 'he', label: 'עברית', text: 'כך נראות הכתוביות\nבכל סרטון.', face: 'NotoSansHebrew-Regular', rtl: true },
  { value: 'zh', label: '中文', text: '字幕看起来是这样的，\n每个视频都一样。', face: 'NotoSansCJKsc-Regular' },
  { value: 'ja', label: '日本語', text: '字幕はこのように\n表示されます。', face: 'NotoSansCJKsc-Regular' },
  { value: 'ko', label: '한국어', text: '자막은 이렇게\n표시됩니다.', face: 'NotoSansCJKsc-Regular' },
] as const satisfies readonly { value: string; label: string; text: string; face?: string; rtl?: boolean }[];

export type SubtitleSample = (typeof SUBTITLE_SAMPLES)[number]['value'];
/** Font family that draws a subtitle typeface as the player does (option labels, preview). */
export const subtitleFontFamily = (font: SubtitleFont) => FAMILIES[font];

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = { font: 'sans-serif', color: '#FFFFFF', edge: 'outline' };

const APPEARANCE_KEY = 'settings.appearance';
const SUBTITLE_SCALE_KEY = 'settings.subtitleScale';
const SUBTITLE_STYLE_KEY = 'settings.subtitleStyle';
const VIDEO_ZOOM_KEY = 'settings.videoZoom';
const DOWNLOAD_NETWORK_KEY = 'settings.downloadNetwork';
const DOWNLOAD_LIMIT_KEY = 'settings.downloadLimit';
const OFFLOAD_DAYS_KEY = 'settings.offloadDays';
const OFFLOAD_WATCHED_KEY = 'settings.offloadWatched';

let appearance: Appearance | undefined;
let subtitleScale: SubtitleScale | undefined;
let subtitleStyle: SubtitleStyle | undefined;
let videoZoom: VideoZoom | undefined;
let downloadNetwork: DownloadNetwork | undefined;
let downloadLimit: number | undefined;
let offloadDays: OffloadDays | undefined;
let offloadWatched: OffloadWatched | undefined;
// Preview only, for this session: not saved.
let subtitleSample: SubtitleSample = 'en';
const listeners = new Set<() => void>();

export function getAppearance(): Appearance {
  if (appearance === undefined) {
    const stored = Storage.getItemSync(APPEARANCE_KEY);
    appearance = APPEARANCE_OPTIONS.find((o) => o.value === stored)?.value ?? 'system';
  }
  return appearance;
}

export function setAppearance(value: Appearance): void {
  Storage.setItemSync(APPEARANCE_KEY, value);
  appearance = value;
  applyNativeAppearance();
  listeners.forEach((l) => l());
}

/** Every setting change; for `useSyncExternalStore` over any getter here (option pickers). */
export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribeSettings, getAppearance);
}

export function getSubtitleScale(): SubtitleScale {
  if (subtitleScale === undefined) {
    const stored = Number(Storage.getItemSync(SUBTITLE_SCALE_KEY));
    subtitleScale = SUBTITLE_SIZES.find((o) => o.value === stored)?.value ?? 1;
  }
  return subtitleScale;
}

export function setSubtitleScale(value: SubtitleScale): void {
  Storage.setItemSync(SUBTITLE_SCALE_KEY, String(value));
  subtitleScale = value;
  listeners.forEach((l) => l());
}

export function useSubtitleScale(): SubtitleScale {
  return useSyncExternalStore(subscribeSettings, getSubtitleScale);
}

/** Saved style; each part falls back to its default on its own (unknown or missing value). */
export function getSubtitleStyle(): SubtitleStyle {
  if (subtitleStyle === undefined) {
    let stored: Partial<Record<keyof SubtitleStyle, unknown>> = {};
    try {
      stored = JSON.parse(Storage.getItemSync(SUBTITLE_STYLE_KEY) ?? '{}') ?? {};
    } catch {}
    const d = DEFAULT_SUBTITLE_STYLE;
    subtitleStyle = {
      font: SUBTITLE_FONTS.find((o) => o.value === stored.font)?.value ?? d.font,
      color: SUBTITLE_COLORS.find((o) => o.value === stored.color)?.value ?? d.color,
      edge: SUBTITLE_EDGES.find((o) => o.value === stored.edge)?.value ?? d.edge,
    };
  }
  return subtitleStyle;
}

export function setSubtitleStyle(change: Partial<SubtitleStyle>): void {
  const current = getSubtitleStyle();
  // An `undefined` part keeps the current one.
  const parts = Object.entries(change).filter(([, v]) => v !== undefined);
  if (parts.every(([k, v]) => current[k as keyof SubtitleStyle] === v)) return;
  const next: SubtitleStyle = { ...current, ...Object.fromEntries(parts) };
  Storage.setItemSync(SUBTITLE_STYLE_KEY, JSON.stringify(next));
  subtitleStyle = next;
  listeners.forEach((l) => l());
}

export function useSubtitleStyle(): SubtitleStyle {
  return useSyncExternalStore(subscribeSettings, getSubtitleStyle);
}

/** Language of the subtitle preview's sample lines (Settings → Subtitles). In memory, not saved. */
export function getSubtitleSample(): SubtitleSample {
  return subtitleSample;
}

export function setSubtitleSample(value: SubtitleSample): void {
  subtitleSample = value;
  listeners.forEach((l) => l());
}

export function useSubtitleSample(): SubtitleSample {
  return useSyncExternalStore(subscribeSettings, getSubtitleSample);
}

// Player video zoom in landscape, same for every account.
export function getVideoZoom(): VideoZoom {
  if (videoZoom === undefined) {
    videoZoom = Storage.getItemSync(VIDEO_ZOOM_KEY) === 'fill' ? 'fill' : 'fit';
  }
  return videoZoom;
}

export function setVideoZoom(value: VideoZoom): void {
  Storage.setItemSync(VIDEO_ZOOM_KEY, value);
  videoZoom = value;
  listeners.forEach((l) => l());
}

export function useVideoZoom(): VideoZoom {
  return useSyncExternalStore(subscribeSettings, getVideoZoom);
}

// Downloads, same for every account (the files are the phone's). Wi-Fi only = unmetered (no personal hotspot).
export const DOWNLOAD_NETWORK_OPTIONS = [
  { value: 'wifi', label: 'Wi-Fi only' },
  { value: 'any', label: 'Any network' },
] as const;

export type DownloadNetwork = (typeof DOWNLOAD_NETWORK_OPTIONS)[number]['value'];

export function getDownloadNetwork(): DownloadNetwork {
  if (downloadNetwork === undefined) {
    downloadNetwork = Storage.getItemSync(DOWNLOAD_NETWORK_KEY) === 'any' ? 'any' : 'wifi';
  }
  return downloadNetwork;
}

export function setDownloadNetwork(value: DownloadNetwork): void {
  Storage.setItemSync(DOWNLOAD_NETWORK_KEY, value);
  downloadNetwork = value;
  listeners.forEach((l) => l());
}

export function useDownloadNetwork(): DownloadNetwork {
  return useSyncExternalStore(subscribeSettings, getDownloadNetwork);
}

const toLimit = (gb: number) => (Number.isFinite(gb) && gb > 0 ? gb : 0);

/** Most space every download together may take, in GB (decimal, as iOS Settings counts); 0 = no limit (default). */
export function getDownloadLimit(): number {
  if (downloadLimit === undefined) {
    downloadLimit = toLimit(Number(Storage.getItemSync(DOWNLOAD_LIMIT_KEY)));
  }
  return downloadLimit;
}

export function setDownloadLimit(gb: number): void {
  const value = toLimit(gb);
  Storage.setItemSync(DOWNLOAD_LIMIT_KEY, String(value));
  downloadLimit = value;
  listeners.forEach((l) => l());
}

export function useDownloadLimit(): number {
  return useSyncExternalStore(subscribeSettings, getDownloadLimit);
}

// Auto-remove (docs/context/downloads.md, Offload): a timer per download from when it finished (or its last reset),
// and an optional sooner removal once watched - after a cooldown, so reaching the end by accident can be undone.
export const OFFLOAD_DAYS = [
  { value: 0, label: 'Never' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
] as const;

export type OffloadDays = (typeof OFFLOAD_DAYS)[number]['value'];

export const OFFLOAD_WATCHED = [
  { value: 0, label: 'Off' },
  { value: 6, label: '6 hours' },
  { value: 24, label: '24 hours' },
  { value: 72, label: '3 days' },
] as const;

/** Hours after watching; 0 = off. */
export type OffloadWatched = (typeof OFFLOAD_WATCHED)[number]['value'];

/** Days after download (or the last Reset Timer) a download goes; 0 = never. Default 90. */
export function getOffloadDays(): OffloadDays {
  if (offloadDays === undefined) {
    const stored = Storage.getItemSync(OFFLOAD_DAYS_KEY);
    offloadDays = OFFLOAD_DAYS.find((o) => stored !== null && o.value === Number(stored))?.value ?? 90;
  }
  return offloadDays;
}

export function setOffloadDays(value: OffloadDays): void {
  Storage.setItemSync(OFFLOAD_DAYS_KEY, String(value));
  offloadDays = value;
  listeners.forEach((l) => l());
}

export function useOffloadDays(): OffloadDays {
  return useSyncExternalStore(subscribeSettings, getOffloadDays);
}

/** Hours after watching a download goes; 0 = off (default). */
export function getOffloadWatched(): OffloadWatched {
  if (offloadWatched === undefined) {
    const stored = Storage.getItemSync(OFFLOAD_WATCHED_KEY);
    offloadWatched = OFFLOAD_WATCHED.find((o) => stored !== null && o.value === Number(stored))?.value ?? 0;
  }
  return offloadWatched;
}

export function setOffloadWatched(value: OffloadWatched): void {
  Storage.setItemSync(OFFLOAD_WATCHED_KEY, String(value));
  offloadWatched = value;
  listeners.forEach((l) => l());
}

export function useOffloadWatched(): OffloadWatched {
  return useSyncExternalStore(subscribeSettings, getOffloadWatched);
}

const LIMIT_STEPS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];

/**
 * Storage limit slider stops in GB for a disk of `diskBytes`: the steps below 90% of the disk (at least the first),
 * then 0 = no limit at the end.
 */
export function downloadLimitSteps(diskBytes: number): number[] {
  const fit = LIMIT_STEPS.filter((gb) => gb * 1e9 < 0.9 * diskBytes);
  return [...(fit.length > 0 ? fit : LIMIT_STEPS.slice(0, 1)), 0];
}

/** Slider stop for a limit: its own, else the nearest (a limit saved on a bigger disk); no limit = the last. */
export function downloadLimitStep(steps: readonly number[], gb: number): number {
  if (gb <= 0) return steps.length - 1;
  let best = 0;
  steps.forEach((s, i) => {
    if (s > 0 && Math.abs(s - gb) < Math.abs(steps[best] - gb)) best = i;
  });
  return best;
}

/** The storage limit in bytes (decimal GB, as the slider shows); 0 = none. */
export const limitBytes = (gb: number) => gb * 1e9;

/** "50 GB", "1.5 TB", "No limit". */
export const formatDownloadLimit = (gb: number) => (gb <= 0 ? 'No limit' : gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`);

/**
 * Native override (headers, tab bar, system UI). JS colours come from `useAppearance()` instead - RN's
 * `setColorScheme` emits no JS event, and on iOS only overrides windows that already exist, so the root layout calls
 * this on mount, not at import.
 */
export function applyNativeAppearance(): void {
  const value = getAppearance();
  RNAppearance.setColorScheme(value === 'system' ? 'auto' : value);
}
