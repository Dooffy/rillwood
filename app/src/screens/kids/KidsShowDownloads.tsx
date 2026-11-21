// SPDX-License-Identifier: GPL-3.0-or-later
// A show's episodes in kids Downloads (docs/context/kids.md, Downloads): from a show's row, a grown-up page. Every
// episode the kid can see, one season at a time (pills; Specials last, their own pill), each with its own download
// button (↓ / ring / ✓) - one by one next to the row menu's big moves (the header ⋯). Not tappable to play. A kept show marks its next 5; deleting one of them asks to stop
// keeping (it would download again). Offline: only what's on the phone, from the items saved with the downloads -
// delete only.
import { Stack, useLocalSearchParams } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, View } from 'react-native';

import type { BaseItemDto, ItemsResult } from '@/api';
import { Artwork } from '@/components/Artwork';
import { DownloadButton } from '@/components/DownloadButton';
import { WIDE_DOWNLOAD_STILL } from '@/components/DownloadRow';
import { EPISODE_ROW_STILL } from '@/components/EpisodeRow';
import { Chip } from '@/components/Chip';
import { headerIconButton } from '@/components/IconButton';
import { LoadError, Message, Offline } from '@/components/Message';
import { ProgressBar } from '@/components/ProgressBar';
import { pageColumn, pageContent } from '@/components/Page';
import { Text } from '@/components/Text';
import { episodeCount } from '@/downloadList';
import { deleteDownloads, downloadGroup, useDownloadSummary, type DownloadSummary } from '@/downloads';
import { hasFile, landscapeImage, posterImage, seasons as seasonsOf } from '@/items';
import { episodesToKeep, NEXT_COUNT } from '@/kidsDownloads';
import { isKept, stopKeeping, useKids } from '@/kidsSettings';
import { formatBytes } from '@/format';
import { useSession } from '@/session';
import { useDownloadNetwork, type DownloadNetwork } from '@/settings';
import { radii, scrollList, spacing, useColors, useWide } from '@/theme';
import { useImage } from '@/useImage';
import { useFetch } from '@/useFetch';
import { refreshKidsShow, useKidsShow } from '@/useKidsShow';

import { statusLine, useShowMenu } from './KidsDownloads';

export type EpisodeSeason = { id: string; name: string; episodes: BaseItemDto[]; special: boolean };

/**
 * Episodes with a file grouped by their season (its id - a server can give specials no season number), in season order,
 * Specials (season 0, or no number) last. `seasons`: the server's list (names, numbers); offline the episodes' own.
 */
export function episodeSeasons(
  episodes: readonly BaseItemDto[],
  seasons: readonly BaseItemDto[] = [],
): EpisodeSeason[] {
  const groups = new Map<string, EpisodeSeason & { index: number }>();
  for (const e of episodes) {
    if (!hasFile(e)) continue;
    const id = e.SeasonId ?? `season-${e.ParentIndexNumber ?? 0}`;
    let group = groups.get(id);
    if (!group) {
      const season = seasons.find((s) => s.Id === id);
      const n = season?.IndexNumber ?? e.ParentIndexNumber ?? 0;
      group = {
        id,
        name: season?.Name ?? e.SeasonName ?? (n > 0 ? `Season ${n}` : 'Specials'),
        episodes: [],
        special: n <= 0,
        index: n > 0 ? n : Number.MAX_SAFE_INTEGER,
      };
      groups.set(id, group);
    }
    group.episodes.push(e);
  }
  return [...groups.values()].sort((a, b) => a.index - b.index).map(({ index: _, ...g }) => g);
}

export type ShowFacts = { title: string; seasons: string; line: string; progress?: number };

/**
 * The card on top: "155 episodes", "3 seasons + Specials", then what's here - "12 downloaded · 1.4 GB" (while it runs
 * the row's words, "Downloading 40% · 2 of 5"; nothing yet "None downloaded yet") + "Keeping next 5" for a kept show.
 * `progress` (downloaded / all) for the bar; none offline (the list is only what's here).
 */
export function showFacts(
  seasons: readonly EpisodeSeason[],
  summary: DownloadSummary | null,
  offline: boolean,
  kept: boolean,
  network: DownloadNetwork = 'wifi',
): ShowFacts {
  const count = seasons.reduce((n, s) => n + s.episodes.length, 0);
  const regular = seasons.filter((s) => !s.special).length;
  const specials = seasons.some((s) => s.special);
  const seasonText = [
    regular > 0 ? `${regular} ${regular === 1 ? 'season' : 'seasons'}` : '',
    specials ? 'Specials' : '',
  ]
    .filter(Boolean)
    .join(' + ');
  const here = summary?.itemIds.length ?? 0;
  const state =
    summary && summary.state !== 'done'
      ? statusLine(summary, true, undefined, undefined, network)
      : summary && here > 0
        ? `${here} downloaded · ${formatBytes(summary.size)}`
        : 'None downloaded yet';
  return {
    title: episodeCount(count),
    seasons: seasonText,
    line: [state, kept ? `Keeping next ${NEXT_COUNT}` : ''].filter(Boolean).join(' · '),
    progress: offline || count === 0 ? undefined : Math.min(1, here / count),
  };
}

/**
 * An episode's line: "Next 5" (a kept show's), "Watched", then the download's state in the page's words ("On this
 * phone · 0.3 GB", "Downloading 40%", "Waiting for Wi-Fi"), else its length ("22 min").
 */
export function episodeLine(
  episode: BaseItemDto,
  summary: DownloadSummary | null,
  next: boolean,
  network: DownloadNetwork = 'wifi',
): string {
  const minutes = episode.RunTimeTicks ? `${Math.max(1, Math.round(episode.RunTimeTicks / 600_000_000))} min` : '';
  return [
    next ? `Next ${NEXT_COUNT}` : '',
    episode.UserData?.Played ? 'Watched' : '',
    statusLine(summary, false, undefined, undefined, network) ?? minutes,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Deleting one of a kept show's next 5: the next sync would bring it back, so it asks to stop keeping the show first.
 * The other episodes stay (as Stop Keeping).
 */
export function confirmStopKeeping(
  accountId: string,
  show: BaseItemDto,
  episodeName: string | undefined,
  ids: readonly string[],
) {
  Alert.alert(
    `Stop keeping ${show.Name}?`,
    `${episodeName ?? 'This episode'} is one of the next ${NEXT_COUNT} Rillwood keeps, so it would download again. Stop keeping the show to delete it.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop Keeping and Delete',
        style: 'destructive',
        onPress: () => {
          stopKeeping(accountId, show.Id);
          deleteDownloads(ids);
        },
      },
    ],
  );
}

export function KidsShowDownloads() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useKidsShow(id);
  const accountId = useSession().active?.id;
  const kept = isKept(useKids(accountId), id);
  const summary = useDownloadSummary(accountId ? downloadGroup(accountId, { seriesId: id }) : null);
  // The server's seasons (names, order); offline the episodes' own.
  const serverSeasons = useFetch<ItemsResult>(data.downloaded ? null : seasonsOf(id).path).data?.Items;
  const seasons = useMemo(() => episodeSeasons(data.episodes, serverSeasons), [data.episodes, serverSeasons]);
  const count = seasons.reduce((n, s) => n + s.episodes.length, 0);
  // The ones Rillwood keeps: the same pick as the top-up (offline: from the downloaded ones).
  const next = useMemo(
    () => new Set(kept ? episodesToKeep(data.episodes, data.nextId).map((e) => e.Id) : []),
    [kept, data.episodes, data.nextId],
  );
  // One season at a time: the picked one, else the next episode's, else the first.
  const [picked, setPicked] = useState<string>();
  const nextSeason = seasons.find((s) => s.episodes.some((e) => e.Id === data.nextId))?.id;
  const shown = seasons.find((s) => s.id === picked) ?? seasons.find((s) => s.id === nextSeason) ?? seasons[0];
  // The show's own item, else (still loading) its name from an episode - the menu and the question need it.
  const first = data.episodes[0];
  const show = useMemo<BaseItemDto | undefined>(
    () => data.show ?? (first ? { Id: id, Name: first.SeriesName ?? 'TV Show', Type: 'Series' } : undefined),
    [data.show, first, id],
  );
  const c = useColors();
  const image = useImage();
  const network = useDownloadNetwork();
  const facts = showFacts(seasons, summary, data.downloaded, kept, network);

  const header = (
    <View style={styles.header}>
      {data.offline.offline && <Offline busy={data.offline.busy} retry={() => refreshKidsShow(id)} />}
      {data.error && <LoadError error={data.error} retry={() => refreshKidsShow(id)} />}
      {data.loading && count === 0 && <ActivityIndicator color={c.text} />}
      {count > 0 && (
        <FactsCard facts={facts} poster={data.art.get(id) ?? (show && image(posterImage(show), CARD_POSTER))} />
      )}
      {seasons.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {seasons.map((s) => (
            <Chip key={s.id} label={s.name} selected={s.id === shown?.id} onPress={() => setPicked(s.id)} />
          ))}
        </ScrollView>
      )}
      {data.empty && (
        <Message text={data.downloaded ? 'Nothing downloaded from this show.' : 'No episodes to download yet.'} />
      )}
    </View>
  );

  return (
    <>
      {show ? <ShowMenu show={show} summary={summary} /> : <Stack.Screen options={{ title: 'Show' }} />}
      <FlatList
        {...scrollList}
        testID="kids-show-downloads"
        contentInsetAdjustmentBehavior="automatic"
        data={shown?.episodes ?? []}
        keyExtractor={(e) => e.Id}
        ListHeaderComponent={header}
        contentContainerStyle={[pageContent, pageColumn, styles.content]}
        renderItem={({ item }) => (
          <EpisodeRow episode={item} show={show} art={data.art.get(item.Id)} next={next.has(item.Id)} />
        )}
      />
    </>
  );
}

/**
 * The page title (the show) and its header ⋯: the show row's menu (Keep Next 5, Whole Show, seasons, Delete Downloads).
 * Dimmed while a download starts.
 */
function ShowMenu({ show, summary }: { show: BaseItemDto; summary: DownloadSummary | null }) {
  const { open, starting, sheet } = useShowMenu(show, summary);
  return (
    <>
      <Stack.Screen
        options={{
          title: show.Name ?? 'Show',
          ...headerIconButton({
            icon: { ios: 'ellipsis', android: 'more_horiz' },
            label: 'Download Menu',
            onPress: open,
            disabled: starting,
          }),
        }}
      />
      {sheet}
    </>
  );
}

const CARD_POSTER = 52;

/** The show at a glance: poster, how big it is, how much is here (+ a bar online). */
function FactsCard({ facts, poster }: { facts: ShowFacts; poster: string | undefined }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.surface }]}>
      <View style={styles.cardPoster}>
        <Artwork image={poster} aspectRatio={2 / 3} />
      </View>
      <View style={styles.facts}>
        <Text variant="button">{facts.title}</Text>
        {facts.seasons !== '' && (
          <Text variant="caption" secondary>
            {facts.seasons}
          </Text>
        )}
        {facts.progress !== undefined && (
          <View style={styles.meter}>
            <ProgressBar progress={facts.progress} label={`${Math.round(facts.progress * 100)}% downloaded`} />
          </View>
        )}
        <Text variant="caption" secondary numberOfLines={2}>
          {facts.line}
        </Text>
      </View>
    </View>
  );
}

/** One episode: still, number + name, its line, its own download button. */
const EpisodeRow = memo(function EpisodeRow({
  episode,
  show,
  art,
  next,
}: {
  episode: BaseItemDto;
  show: BaseItemDto | undefined;
  art?: string;
  next: boolean;
}) {
  const c = useColors();
  const image = useImage();
  const wide = useWide();
  const accountId = useSession().active?.id;
  const summary = useDownloadSummary(accountId ? downloadGroup(accountId, { itemId: episode.Id }) : null);
  const network = useDownloadNetwork();
  const width = wide ? WIDE_DOWNLOAD_STILL : EPISODE_ROW_STILL;
  const title = episode.IndexNumber !== undefined ? `${episode.IndexNumber}. ${episode.Name}` : episode.Name;
  const ask =
    next && accountId && show
      ? (ids: readonly string[]) => confirmStopKeeping(accountId, show, episode.Name, ids)
      : undefined;
  return (
    <View style={[styles.row, { backgroundColor: c.surface }]}>
      <View style={{ width }}>
        <Artwork image={art ?? image(landscapeImage(episode), width)} aspectRatio={16 / 9} />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={2}>{title}</Text>
        <Text variant="caption" secondary numberOfLines={1}>
          {episodeLine(episode, summary, next, network)}
        </Text>
      </View>
      <DownloadButton item={episode} round label={`Download ${episode.Name}`} onDelete={ask} />
    </View>
  );
});

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  pills: { gap: spacing.sm, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    padding: spacing.sm + spacing.xs,
    borderRadius: radii.card,
  },
  cardPoster: { width: CARD_POSTER },
  facts: { flex: 1, gap: 2 },
  meter: { marginVertical: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.card,
  },
  text: { flex: 1, gap: 2 },
});
