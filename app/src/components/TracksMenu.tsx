// SPDX-License-Identifier: GPL-3.0-or-later
// Player tracks menu on the shared ActionSheet: a main page (audio, subtitles, speed, subtitle size with their current
// value) that opens one list per setting. The screen owns the page so a pick can close one sheet and open the next.
import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import type { TrackOption } from '@/playback';

export type TracksPage = 'main' | 'audio' | 'subtitles' | 'speed' | 'size';

export type TracksValue = {
  /** mpv ids; subtitle -1 = off. */
  audio?: number;
  subtitle: number;
  speed: number;
  subtitleScale: number;
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SUBTITLE_SIZES: [label: string, scale: number][] = [
  ['Small', 0.8],
  ['Medium', 1],
  ['Large', 1.25],
  ['Extra large', 1.5],
];

const speedLabel = (speed: number) => (speed === 1 ? 'Normal' : `${speed}×`);

export function TracksMenu({
  page,
  onPage,
  audio,
  subtitles,
  value,
  onChange,
}: {
  page: TracksPage | null;
  onPage: (page: TracksPage | null) => void;
  audio: TrackOption[];
  subtitles: TrackOption[];
  value: TracksValue;
  onChange: (next: Partial<TracksValue>) => void;
}) {
  const subtitleChoices = [{ id: -1, index: -1, label: 'Off' }, ...subtitles];
  const label = (options: TrackOption[], id: number | undefined) => options.find((t) => t.id === id)?.label;
  const size = SUBTITLE_SIZES.find(([, scale]) => scale === value.subtitleScale)?.[0];

  const pick = (options: TrackOption[], current: number | undefined, key: 'audio' | 'subtitle') =>
    options.map((t): SheetAction => ({
      label: t.label,
      selected: t.id === current,
      onPress: () => onChange({ [key]: t.id }),
    }));

  const pages: Record<TracksPage, { title: string; actions: SheetAction[] }> = {
    main: {
      title: 'Audio and subtitles',
      actions: [
        ...(audio.length > 0
          ? [{ label: 'Audio', detail: label(audio, value.audio), onPress: () => onPage('audio') }]
          : []),
        {
          label: 'Subtitles',
          detail: label(subtitleChoices, value.subtitle),
          onPress: () => onPage('subtitles'),
        },
        { label: 'Speed', detail: speedLabel(value.speed), onPress: () => onPage('speed') },
        { label: 'Subtitle size', detail: size, onPress: () => onPage('size') },
      ],
    },
    audio: { title: 'Audio', actions: pick(audio, value.audio, 'audio') },
    subtitles: { title: 'Subtitles', actions: pick(subtitleChoices, value.subtitle, 'subtitle') },
    speed: {
      title: 'Speed',
      actions: SPEEDS.map((speed) => ({
        label: speedLabel(speed),
        selected: speed === value.speed,
        onPress: () => onChange({ speed }),
      })),
    },
    size: {
      title: 'Subtitle size',
      actions: SUBTITLE_SIZES.map(([sizeLabel, subtitleScale]) => ({
        label: sizeLabel,
        selected: subtitleScale === value.subtitleScale,
        onPress: () => onChange({ subtitleScale }),
      })),
    },
  };
  const shown = pages[page ?? 'main'];
  return (
    <ActionSheet visible={page !== null} title={shown.title} actions={shown.actions} onClose={() => onPage(null)} />
  );
}
