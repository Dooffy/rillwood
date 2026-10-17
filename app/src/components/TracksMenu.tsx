// SPDX-License-Identifier: GPL-3.0-or-later
// Player tracks menu on the shared ActionSheet: a main page (audio, subtitles, speed with their current value) that opens
// one list per setting (subtitle timing: a slider, only while subtitles are on). The screen owns the page so a pick can
// close one sheet and open the next. How subtitles look is set in Settings → Subtitles. Tablets: a menu under its button
// (`anchor`) instead of a bottom sheet.
import type { ReactNode } from 'react';

import { ActionSheet, type ActionSheetProps, type SheetAction } from '@/components/ActionSheet';
import { TimingSlider } from '@/components/TimingSlider';
import { formatDelay } from '@/format';
import type { TrackChoice, TrackOption } from '@/playback';

export type TracksPage = 'main' | 'audio' | 'subtitles' | 'speed' | 'timing';

// Choices for this screen.
export type TracksValue = TrackChoice & {
  speed: number;
  /** Subtitle timing in seconds (mpv `sub-delay`): negative = earlier, positive = later. */
  subtitleDelay: number;
};

// A list of actions, or a control with Done (`closeLabel`) for one that applies as it changes.
type Page = { title: string; actions?: SheetAction[]; content?: ReactNode; closeLabel?: string };

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const speedLabel = (speed: number) => (speed === 1 ? 'Normal' : `${speed}×`);

export function TracksMenu({
  page,
  onPage,
  audio,
  subtitles,
  value,
  onChange,
  anchor,
}: {
  page: TracksPage | null;
  onPage: (page: TracksPage | null) => void;
  audio: TrackOption[];
  subtitles: TrackOption[];
  value: TracksValue;
  onChange: (next: Partial<TracksValue>) => void;
  anchor?: ActionSheetProps['anchor'];
}) {
  const subtitleChoices = [{ id: -1, index: -1, label: 'Off' }, ...subtitles];
  const label = (options: TrackOption[], index: number | undefined) => options.find((t) => t.index === index)?.label;

  const pick = (options: TrackOption[], current: number | undefined, key: 'audio' | 'subtitle') =>
    options.map((t): SheetAction => ({
      label: t.label,
      selected: t.index === current,
      onPress: () => onChange({ [key]: t.index }),
    }));

  const pages: Record<TracksPage, Page> = {
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
        ...(value.subtitle !== -1
          ? [{ label: 'Subtitle timing', detail: formatDelay(value.subtitleDelay), onPress: () => onPage('timing') }]
          : []),
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
    // A slider instead of a list: applied as it changes, the sheet closes with Done.
    timing: {
      title: 'Subtitle timing',
      content: <TimingSlider value={value.subtitleDelay} onChange={(subtitleDelay) => onChange({ subtitleDelay })} />,
      closeLabel: 'Done',
    },
  };
  const shown = pages[page ?? 'main'];
  return (
    <ActionSheet
      visible={page !== null}
      title={shown.title}
      actions={shown.actions}
      closeLabel={shown.closeLabel}
      anchor={anchor}
      onClose={() => onPage(null)}
    >
      {shown.content}
    </ActionSheet>
  );
}
