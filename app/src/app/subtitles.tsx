// SPDX-License-Identifier: GPL-3.0-or-later
// Settings → Subtitles: how subtitles look, on this phone for every account. Each row opens its checkmark list
// (`/option/[key]`) with the preview on top. The player menu only picks the track and its timing.
import { ListSection } from '@/components/List';
import { OptionRow } from '@/components/OptionList';
import { Page } from '@/components/Page';
import { SubtitlePreview } from '@/components/SubtitlePreview';

export default function Subtitles() {
  return (
    <Page>
      <SubtitlePreview />
      <ListSection footer="Applies to text subtitles (SRT, VTT). Styled (ASS) and picture (PGS) subtitles keep their own look.">
        <OptionRow option="subtitle-size" />
        <OptionRow option="subtitle-font" />
        <OptionRow option="subtitle-colour" />
        <OptionRow option="subtitle-edge" />
      </ListSection>
      <ListSection>
        <OptionRow option="subtitle-sample" />
      </ListSection>
    </Page>
  );
}
