// SPDX-License-Identifier: GPL-3.0-or-later
// Movie / episode detail: tall hero (art + scrim, logo or title), Play + watched / favourite, chips, overview, media
// rows, cast & crew. Data rules: docs/context/api.md (Detail). Play opens the player route; playback lands in M4.
// Watched, favourite and download are placeholders for now (toast).
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { IconButton } from '@/components/IconButton';
import { Chevron, ListRow, ListSection } from '@/components/List';
import { loadErrorMessage, Message } from '@/components/Message';
import { PERSON_SIZE, PersonCard } from '@/components/PersonCard';
import { ProgressBar } from '@/components/ProgressBar';
import { Row } from '@/components/Row';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { detailView } from '@/detail';
import { formatRemaining } from '@/format';
import { isItemId, itemDetail, personImage, personRole, type TrackRow } from '@/items';
import { openItem } from '@/navigation';
import { useFetch } from '@/useFetch';
import { useImage } from '@/useImage';
import { minTouch, pressedOpacity, spacing, useColors } from '@/theme';

/** Hero art height / width (4:5, Apple TV style): backdrops are cover-cropped, posters fit almost whole. */
const HERO_RATIO = 1.25;
/** Image width / screen width for the hero: 16:9 art cover-cropped into 4:5 is about 2.2x as wide as the screen. */
const HERO_ART_SCALE = HERO_RATIO * (16 / 9);
const LOGO_WIDTH = 240;
/** Longer overviews start clamped to 3 lines with More. */
const OVERVIEW_CLAMP = 150;

const SOON = 'Coming in a later build.';

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const valid = isItemId(id);
  const { data, error, refresh } = useFetch<BaseItemDto>(valid ? itemDetail(id).path : null);

  if (!valid || error?.status === 404) return <Message fill text="This item isn't available." />;
  if (data) return <Detail item={data} />;
  if (error) return <Message fill text={loadErrorMessage(error)} retry={refresh} />;
  return <Spinner fill />;
}

/** Opens the player (M4) at `start` seconds. */
function play(item: BaseItemDto, start: number) {
  router.push({ pathname: '/player', params: { id: item.Id, start: String(Math.floor(start)) } });
}

function Detail({ item }: { item: BaseItemDto }) {
  const c = useColors();
  const toast = useToast();
  const image = useImage();
  const { width } = useWindowDimensions();
  const view = detailView(item);
  const { progress, resumeSeconds = 0, remainingSeconds = 0, played } = view.playback;
  const inProgress = progress !== undefined;
  // undefined at 0 (position at or past the runtime): no bare "left".
  const left = formatRemaining(remainingSeconds);
  const art = image(view.art, width * HERO_ART_SCALE);
  const logo = image(view.logo, LOGO_WIDTH);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              variant="plain"
              icon={{ ios: 'arrow.down', android: 'download' }}
              label="Download"
              onPress={() => toast(SOON)}
            />
          ),
        }}
      />
      {/* The hero runs under the transparent header (back + download over the art). */}
      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.scroll}>
        <View style={[styles.hero, { width, height: width * HERO_RATIO, backgroundColor: c.surface }]}>
          {art && (
            <Image
              testID="detail-backdrop"
              source={art}
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={150}
              style={StyleSheet.absoluteFill}
              accessible={false}
            />
          )}
          {/* Darkens the top under the header buttons, fades the bottom into the page under the title. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundImage: `linear-gradient(to bottom, ${c.background}66 0%, ${c.background}00 20%, ${c.background}00 45%, ${c.background} 100%)`,
              },
            ]}
          />
          <View style={styles.heroText}>
            {item.Type === 'Episode' && item.SeriesId && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.SeriesName ?? 'Series'}
                accessibilityHint="Opens the series"
                onPress={() => openItem({ Id: item.SeriesId!, Name: item.SeriesName ?? '', Type: 'Series' })}
                style={({ pressed }) => [styles.series, pressed && styles.pressed]}
              >
                <Text variant="label" secondary numberOfLines={1}>
                  {item.SeriesName}
                </Text>
                <Chevron />
              </Pressable>
            )}
            {logo ? (
              <Image
                testID="detail-logo"
                source={logo}
                cachePolicy="memory-disk"
                contentFit="contain"
                style={styles.logo}
                accessible
                accessibilityRole="header"
                accessibilityLabel={item.Name}
              />
            ) : (
              <Text variant="largeTitle" accessibilityRole="header" numberOfLines={3} style={styles.center}>
                {item.Name}
              </Text>
            )}
            {view.subtitle !== '' && (
              <Text secondary numberOfLines={1}>
                {view.subtitle}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.body}>
          {inProgress && (
            <View style={styles.progress}>
              <View style={styles.bar}>
                <ProgressBar progress={progress} />
              </View>
              {left && (
                <Text variant="caption" secondary>
                  {left} left
                </Text>
              )}
            </View>
          )}

          <View style={styles.actions}>
            <View style={styles.play}>
              <Button
                title={inProgress ? 'Resume' : 'Play'}
                icon={{ ios: 'play.fill', android: 'play_arrow' }}
                onPress={() => play(item, resumeSeconds)}
              />
            </View>
            <IconButton
              icon={{ ios: played ? 'checkmark.circle.fill' : 'checkmark', android: 'check' }}
              label={played ? 'Watched' : 'Mark as watched'}
              onPress={() => toast(SOON)}
            />
            <IconButton
              icon={{ ios: 'heart', android: 'favorite' }}
              label="Add to favourites"
              onPress={() => toast(SOON)}
            />
          </View>
          {inProgress && <Button title="Play from Start" variant="secondary" onPress={() => play(item, 0)} />}

          {item.Overview?.trim() ? <Overview text={item.Overview.trim()} /> : null}

          <Chips items={view.chips} />
          {played && (
            <Text variant="caption" secondary>
              ✓ Watched
            </Text>
          )}

          {(view.media.video || view.media.audio || view.media.subtitles) && (
            <ListSection title="Media">
              {view.versions && <ListRow label={`Version (${view.versions.count})`} value={view.versions.name} />}
              {view.media.video && <TrackListRow label="Video" row={view.media.video} />}
              {view.media.audio && <TrackListRow label="Audio" row={view.media.audio} />}
              {view.media.subtitles && <TrackListRow label="Subtitles" row={view.media.subtitles} />}
            </ListSection>
          )}
        </View>

        {view.people.length > 0 && (
          <Row title="Cast & Crew">
            {view.people.map((p) => (
              <PersonCard
                key={`${p.Id}-${p.Type}`}
                name={p.Name}
                role={personRole(p)}
                image={image(personImage(p), PERSON_SIZE)}
              />
            ))}
          </Row>
        )}
      </ScrollView>
    </>
  );
}

/** Longer overviews start clamped to 3 lines; tapping toggles More / Less. Own state: a tap re-renders only this. */
function Overview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const clampable = text.length > OVERVIEW_CLAMP;
  return (
    <Pressable
      disabled={!clampable}
      accessibilityRole={clampable ? 'button' : undefined}
      accessibilityHint={clampable ? (expanded ? 'Shows less' : 'Shows the whole overview') : undefined}
      onPress={() => setExpanded((e) => !e)}
    >
      <Text numberOfLines={clampable && !expanded ? 3 : undefined}>{text}</Text>
      {clampable && (
        <Text variant="label" secondary>
          {expanded ? 'Less' : 'More'}
        </Text>
      )}
    </Pressable>
  );
}

/** "Audio (2)  English - Dolby Digital - 5.1" - what plays by default; picking a track comes with the player. */
function TrackListRow({ label, row }: { label: string; row: TrackRow }) {
  return <ListRow label={row.count > 1 ? `${label} (${row.count})` : label} value={row.value} />;
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.lg, gap: spacing.lg },
  hero: { justifyContent: 'flex-end' },
  heroText: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  logo: { width: LOGO_WIDTH, height: LOGO_WIDTH / 3 },
  center: { textAlign: 'center' },
  series: { minHeight: minTouch, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pressed: { opacity: pressedOpacity },
  body: { paddingHorizontal: spacing.md, gap: spacing.md },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bar: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  play: { flex: 1 },
});
