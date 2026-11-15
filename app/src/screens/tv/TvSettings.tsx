// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Settings (screen draft 13, tvOS Settings style): the list on the right, a picture and a line about the focused
// row on the left (the subtitle preview, the option's icon, the account). Pages open in the same layout and Back
// (Menu / Esc) steps back through them, focus returning to the row that opened the page. On / Off rows toggle in place;
// the rest open the option's checkmark list (the phone's `pickers`), saved on click. No Appearance (tvOS follows the
// system) and no Downloads. About: the source code and privacy policy as QR codes (no browser on tvOS), Licences.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { FFMPEG_CREDIT } from '@/components/LicencesList';
import { LogoMark } from '@/components/LogoMark';
import { aboutLinks } from '@/components/SettingsPages';
import { SubtitlePreview } from '@/components/SubtitlePreview';
import { Text } from '@/components/Text';
import { holdBack, useBackScope, useTvBack } from '@/components/tv/focus';
import { TvListRow, TvListSection } from '@/components/tv/TvListRow';
import { TvQrCode } from '@/components/tv/TvQrCode';
import { licenceById, licenceSections, type Licence } from '@/licences';
import { PICKERS, usePicker, type PickerKey } from '@/pickers';
import { useSession } from '@/session';
import { scrollList, tv, useColors } from '@/theme';

import { TvBackView } from '../../../modules/tv-back';

type Page =
  | { page: 'root' }
  | { page: 'subtitles' }
  | { page: 'option'; key: PickerKey }
  | { page: 'about' }
  | { page: 'licences' }
  | { page: 'licence'; id: number };

/** A page on the stack; `focus`: its row that opened the page over it (focus goes back there). */
type Entry = { page: Page; focus?: string };

/** What the page's rows need from the screen. */
type PageProps = {
  /** Opens `page` over this one; `from`: the row's key. */
  open: (page: Page, from: string) => void;
  /** The row to focus first (back from a page it opened). */
  focus?: string;
  /** A row got focus: the left side follows it. */
  onFocus: (key: string) => void;
  /** The focused row's key, else the page's first. */
  focused?: string;
};

const SUBTITLES_TEXT =
  'Size, font, colour and edge for text subtitles (SRT, VTT). Styled (ASS) and picture (PGS) subtitles keep their own look.';

const ICONS: Partial<Record<PickerKey, SymbolViewProps['name']>> = {
  'autoplay-next': 'forward.end.circle',
  'audio-language': 'speaker.wave.2',
  'subtitle-mode': 'captions.bubble',
  'subtitle-language': 'captions.bubble',
};

const version = Constants.expoConfig?.version;

/** The heading over the list. */
function title(page: Page): string {
  if (page.page === 'option') return PICKERS[page.key].title;
  if (page.page === 'licence') return licenceById(page.id)?.name ?? 'Licence';
  return { root: 'Settings', subtitles: 'Subtitles', about: 'About', licences: 'Licences' }[page.page];
}

export function TvSettings() {
  const c = useColors();
  const [stack, setStack] = useState<Entry[]>([{ page: { page: 'root' } }]);
  const [focused, setFocused] = useState<string>();
  const entry = stack[stack.length - 1];
  const nested = stack.length > 1;

  const open = (page: Page, from: string) => {
    setStack((s) => [...s.slice(0, -1), { ...s[s.length - 1], focus: from }, { page }]);
    setFocused(undefined);
  };
  const back = useRef(() => {});
  useEffect(() => {
    back.current = () => {
      setFocused(stack[stack.length - 2]?.focus);
      setStack((s) => s.slice(0, -1));
    };
  });
  // Back steps out of a page; on the list itself it leaves Settings (the stack pops).
  const scope = useBackScope();
  useEffect(() => (nested ? holdBack(() => back.current(), scope) : undefined), [nested, scope]);
  const catcher = useTvBack();

  const props: PageProps = { open, focus: entry.focus, onFocus: setFocused, focused: focused ?? entry.focus };
  const { page } = entry;
  return (
    <TvBackView {...catcher} style={[styles.root, { backgroundColor: c.background }]}>
      <Text accessibilityRole="header" style={[tv.type.shelf, styles.title]}>
        {title(page)}
      </Text>
      {/* key: a new page starts at its top, its own focus. */}
      <View key={stack.length} style={styles.columns}>
        {page.page === 'root' && <RootPage {...props} />}
        {page.page === 'subtitles' && <SubtitlesPage {...props} />}
        {page.page === 'option' && <OptionPage option={page.key} {...props} />}
        {page.page === 'about' && <AboutPage {...props} />}
        {page.page === 'licences' && <LicencesPage {...props} />}
        {page.page === 'licence' && <LicencePage id={page.id} />}
      </View>
    </TvBackView>
  );
}

/** The left side: a picture (or icon) and a line about the focused row. */
function Aside({ picture, text }: { picture?: ReactNode; text?: string }) {
  return (
    <View testID="tv-settings-aside" style={styles.aside}>
      <View style={styles.picture}>{picture}</View>
      {text !== undefined && (
        // A long packages list (one licence entry for many packages) stays on screen.
        <Text secondary numberOfLines={14} style={[tv.type.caption, styles.asideText]}>
          {text}
        </Text>
      )}
    </View>
  );
}

/** The saved subtitle look, across the left side. */
function Preview() {
  return (
    <View style={styles.preview}>
      <SubtitlePreview />
    </View>
  );
}

function AsideIcon({ name }: { name: SymbolViewProps['name'] }) {
  const c = useColors();
  return <SymbolView name={name} tintColor={c.textSecondary} size={tv.settings.asideIcon} />;
}

/** The list column. */
function List({ children }: { children: ReactNode }) {
  return (
    <ScrollView {...scrollList} style={styles.list} contentContainerStyle={styles.listContent}>
      {children}
    </ScrollView>
  );
}

function RootPage({ open, focus, onFocus, focused = 'account' }: PageProps) {
  const { active } = useSession();
  const size = usePicker('subtitle-size').choice?.label;
  const colour = usePicker('subtitle-colour').choice?.label;
  const row = (key: string) => ({ onFocus: () => onFocus(key), preferredFocus: focus === key });

  let aside: ReactNode;
  if (focused === 'account') {
    aside = (
      <Aside
        picture={<Avatar name={active?.userName} size={tv.profile.avatar} />}
        text="Switch accounts, sign out or add one on Who's Watching."
      />
    );
  } else if (focused === 'subtitles') {
    aside = <Aside picture={<Preview />} text={SUBTITLES_TEXT} />;
  } else if (focused === 'about') {
    aside = <Aside picture={<LogoMark size={tv.settings.asideIcon} />} text={version && `Version ${version}`} />;
  } else {
    aside = <OptionAside option={focused as PickerKey} />;
  }

  return (
    <>
      {aside}
      <List>
        {active && (
          <TvListSection title="Accounts">
            <TvListRow
              label={`${active.userName} · ${active.server.name}`}
              leading={<Avatar name={active.userName} size={tv.settings.rowAvatar} />}
              chevron
              // Who's Watching opened Settings: back to it (else it opens).
              onPress={() => router.dismissTo('/accounts')}
              {...row('account')}
              preferredFocus={focus === undefined || focus === 'account'}
            />
          </TvListSection>
        )}
        <TvListSection title="Display">
          <TvListRow
            label="Subtitles"
            value={`${size}, ${colour}`}
            chevron
            onPress={() => open({ page: 'subtitles' }, 'subtitles')}
            {...row('subtitles')}
            preferredFocus={focus === 'subtitles' || (!active && focus === undefined)}
          />
        </TvListSection>
        <TvListSection title="Playback">
          <OptionRow option="autoplay-next" open={open} {...row('autoplay-next')} />
          <OptionRow option="audio-language" open={open} {...row('audio-language')} />
          <OptionRow option="subtitle-mode" open={open} {...row('subtitle-mode')} />
        </TvListSection>
        <TvListSection title="About">
          <TvListRow
            label="About Rillwood"
            value={version}
            chevron
            onPress={() => open({ page: 'about' }, 'about')}
            {...row('about')}
          />
        </TvListSection>
      </List>
    </>
  );
}

/** An option's icon (or the subtitle preview) and its footer. */
function OptionAside({ option }: { option: PickerKey }) {
  const picker = PICKERS[option];
  if (!picker) return <Aside />;
  if (picker.preview) return <Aside picture={<Preview />} text={picker.footer ?? SUBTITLES_TEXT} />;
  const icon = ICONS[option];
  return <Aside picture={icon && <AsideIcon name={icon} />} text={picker.footer} />;
}

/** A row for an option: On / Off toggles in place, anything else opens its list. */
function OptionRow({
  option,
  open,
  onFocus,
  preferredFocus,
}: {
  option: PickerKey;
  open: PageProps['open'];
  onFocus: () => void;
  preferredFocus?: boolean;
}) {
  const { picker, value, choice } = usePicker(option);
  // On / Off: a click flips it (tvOS Settings).
  const toggle = picker?.choices.length === 2 && picker.choices.every((c) => c.label === 'On' || c.label === 'Off');
  return (
    <TvListRow
      label={picker?.title ?? option}
      value={choice?.label}
      chevron={!toggle}
      onPress={() => {
        if (!toggle) return open({ page: 'option', key: option }, option);
        picker!.set(picker!.choices.find((c) => c.value !== value)!.value);
      }}
      onFocus={onFocus}
      preferredFocus={preferredFocus}
    />
  );
}

function SubtitlesPage({ open, focus, onFocus, focused = 'subtitle-size' }: PageProps) {
  const row = (key: PickerKey) => ({
    onFocus: () => onFocus(key),
    preferredFocus: focus === key || (focus === undefined && key === 'subtitle-size'),
  });
  return (
    <>
      <Aside picture={<Preview />} text={PICKERS[focused as PickerKey]?.footer ?? SUBTITLES_TEXT} />
      <List>
        <TvListSection>
          <OptionRow option="subtitle-size" open={open} {...row('subtitle-size')} />
          <OptionRow option="subtitle-font" open={open} {...row('subtitle-font')} />
          <OptionRow option="subtitle-colour" open={open} {...row('subtitle-colour')} />
          <OptionRow option="subtitle-edge" open={open} {...row('subtitle-edge')} />
        </TvListSection>
        <TvListSection>
          <OptionRow option="subtitle-sample" open={open} {...row('subtitle-sample')} />
        </TvListSection>
      </List>
    </>
  );
}

/** An option's checkmark list (and the related one under it, as on phones); a click saves. */
function OptionPage({ option, onFocus, focused }: { option: PickerKey } & PageProps) {
  const more = PICKERS[option].more as PickerKey | undefined;
  // The focused row's option: its footer on the left.
  const shown = (focused?.split(':')[0] as PickerKey | undefined) ?? option;
  return (
    <>
      <OptionAside option={PICKERS[shown] ? shown : option} />
      <List>
        <OptionChoices option={option} title={more ? PICKERS[option].section : undefined} onFocus={onFocus} first />
        {more && PICKERS[more] && (
          <OptionChoices option={more} title={PICKERS[more].section ?? PICKERS[more].title} onFocus={onFocus} />
        )}
      </List>
    </>
  );
}

function OptionChoices({
  option,
  title,
  onFocus,
  first = false,
}: {
  option: PickerKey;
  title?: string;
  onFocus: (key: string) => void;
  first?: boolean;
}) {
  const { picker, value } = usePicker(option);
  if (!picker) return null;
  return (
    <View accessibilityRole="radiogroup">
      <TvListSection title={title}>
        {picker.choices.map((o) => (
          <TvListRow
            key={String(o.value)}
            label={o.label}
            checked={o.value === value}
            swatch={o.swatch}
            fontFamily={o.fontFamily}
            onPress={() => picker.set(o.value)}
            onFocus={() => onFocus(`${option}:${o.value}`)}
            // Focus starts on the saved choice.
            preferredFocus={first && o.value === value}
          />
        ))}
      </TvListSection>
    </View>
  );
}

function AboutPage({ open, focus, onFocus }: PageProps) {
  const { source, privacy } = aboutLinks();
  return (
    <>
      <Aside
        picture={
          <View style={styles.about}>
            <LogoMark size={tv.markSize} />
            <Text style={tv.type.title}>Rillwood</Text>
            {version && (
              <Text secondary style={tv.type.caption}>
                {`Version ${version}`}
              </Text>
            )}
          </View>
        }
        text="A free, open-source app for Jellyfin servers. Plays your files as they are. Free software under the GNU GPL version 3 or later. Not made by or affiliated with the Jellyfin project."
      />
      <List>
        <Text secondary style={[tv.type.caption, styles.scan]}>
          Scan with your phone&apos;s camera to open.
        </Text>
        <View style={styles.codes}>
          {source && <TvQrCode title="Source code" url={source} />}
          {privacy && <TvQrCode title="Privacy policy" url={privacy} />}
        </View>
        <TvListSection>
          <TvListRow
            label="Licences"
            chevron
            onPress={() => open({ page: 'licences' }, 'licences')}
            onFocus={() => onFocus('licences')}
            preferredFocus={focus === undefined || focus === 'licences'}
          />
        </TvListSection>
      </List>
    </>
  );
}

type LicenceItem = { key: string; heading: string } | { key: string; licence: Licence };

function LicencesPage({ open, focus, onFocus }: PageProps) {
  const [items] = useState((): LicenceItem[] => {
    const { app, native, packages } = licenceSections();
    const rows = (list: Licence[]) => list.map((licence) => ({ key: `licence:${licence.id}`, licence }));
    return [
      ...rows([app]),
      { key: 'native', heading: 'Native components' },
      ...rows(native),
      { key: 'packages', heading: 'Packages' },
      ...rows(packages),
    ];
  });
  const first = items.find((i) => 'licence' in i)?.key;
  return (
    <>
      <Aside picture={<AsideIcon name="doc.text" />} text={FFMPEG_CREDIT} />
      <FlatList
        {...scrollList}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={items}
        // Back from an entry far down: render up to it, so it can take focus again.
        initialNumToRender={Math.max(20, items.findIndex((i) => i.key === focus) + 5)}
        renderItem={({ item }) =>
          'heading' in item ? (
            <Text secondary accessibilityRole="header" style={[tv.type.caption, styles.heading]}>
              {item.heading}
            </Text>
          ) : (
            <TvListRow
              label={item.licence.name}
              value={item.licence.licence}
              chevron
              onPress={() => open({ page: 'licence', id: item.licence.id }, item.key)}
              onFocus={() => onFocus(item.key)}
              preferredFocus={focus === item.key || (focus === undefined && item.key === first)}
            />
          )
        }
      />
    </>
  );
}

/** One entry: its licence, source and packages on the left; the full texts on the right, a paragraph per focus stop. */
function LicencePage({ id }: { id: number }) {
  const licence = licenceById(id);
  const paragraphs = licence?.texts.flatMap((text) => text.split(/\n\s*\n/)) ?? [];
  const details = licence && [
    licence.licence,
    licence.note,
    licence.url && `Source: ${licence.url}`,
    (licence.packages?.length ?? 0) > 1 && `Packages:\n${licence.packages!.join('\n')}`,
  ];
  return (
    <>
      <Aside text={details ? details.filter(Boolean).join('\n\n') : "This licence isn't available."} />
      <List>
        {licence && paragraphs.length === 0 && (
          <Text secondary style={tv.type.body}>
            The package ships no licence file.
          </Text>
        )}
        {paragraphs.map((p, i) => (
          <Paragraph key={i} text={p} first={i === 0} />
        ))}
      </List>
    </>
  );
}

/** Text the remote scrolls through: each paragraph takes focus (a soft fill), so a swipe moves down the text. */
function Paragraph({ text, first }: { text: string; first: boolean }) {
  return (
    <Pressable
      accessibilityRole="text"
      focusable
      hasTVPreferredFocus={first}
      style={({ focused }) => [styles.paragraph, focused && { backgroundColor: tv.unfocused }]}
    >
      <Text style={tv.type.small}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: tv.marginTop },
  title: { textAlign: 'center' },
  columns: { flex: 1, flexDirection: 'row', gap: tv.settings.gap, paddingHorizontal: tv.margin },
  aside: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tv.gap.lg },
  picture: { width: tv.settings.asideWidth, alignItems: 'center' },
  preview: { alignSelf: 'stretch' },
  asideText: { textAlign: 'center', maxWidth: tv.settings.asideWidth },
  list: { width: tv.settings.listWidth, flexGrow: 0 },
  // Room on every side for a focused row's lift (it grows past the list's width), else the scroll view cuts it.
  listContent: { gap: tv.gap.lg, padding: tv.shelf.focusRoom },
  heading: { paddingHorizontal: tv.settings.row.paddingHorizontal, paddingTop: tv.gap.sm },
  about: { alignItems: 'center', gap: tv.gap.sm },
  scan: { textAlign: 'center' },
  codes: { flexDirection: 'row', justifyContent: 'center', gap: tv.gap.lg * 2 },
  paragraph: { borderRadius: tv.settings.row.radius, padding: tv.gap.sm / 2 },
});
