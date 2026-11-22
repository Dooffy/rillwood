// SPDX-License-Identifier: GPL-3.0-or-later
// A show's episodes in kids Downloads (docs/context/kids.md, Downloads): from a show's row, a grown-up page. Every
// episode the kid can see, one season at a time (pills; Specials last, their own pill), each with its own download
// button (↓ / ring / ✓) - one by one next to the row menu's big moves (the header ⋯). Not tappable to play. The
// Downloads tab's show page look (draft docs/research/downloads-parity.html): the shared show header and row frame. A
// kept show marks its next 5 ("Kept"); deleting one of them asks to stop keeping (it would download again). Offline:
// only what's on the phone, from the items saved with the downloads - delete only.
import { Stack, useLocalSearchParams } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, View } from 'react-native';

import type { BaseItemDto, ItemsResult } from '@/api';
import { Chip } from '@/components/Chip';
import { DownloadButton } from '@/components/DownloadButton';
import {
  downloadArtWidth,
  DownloadRowFrame,
  DownloadRowGap,
  DownloadShowHeader,
  expiryLine,
  useGroupExpiry,
  type RowLine,
} from '@/components/DownloadRow';
import { headerIconButton } from '@/components/IconButton';
import { LoadError, Message, Offline } from '@/components/Message';
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
import { backdrop, onArtwork, radii, scrollList, spacing, useColors, useWide } from '@/theme';
import { useImage } from '@/useImage';
import { useFetch } from '@/useFetch';
import { refreshKidsShow, useKidsShow } from '@/useKidsShow';

import { KEPT_LINE, statusLine, useShowMenu } from './KidsDownloads';

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

export type ShowFacts = { totals: string; status?: string; progress?: number };

/**
 * The show header's words: "5 of 32 episodes · 1.4 GB" (on the phone / the kid can see; nothing yet "32 episodes";
 * offline, only what's here, "2 episodes · 600 MB"), while it runs the row's words ("Downloading 40% · 2 of 5").
 * `progress` (downloaded / all) for the bar; none offline (the list is only what's here).
 */
export function showFacts(
  seasons: readonly EpisodeSeason[],
  summary: DownloadSummary | null,
  offline: boolean,
  network: DownloadNetwork = 'wifi',
): ShowFacts {
  const count = seasons.reduce((n, s) => n + s.episodes.length, 0);
  const here = summary?.itemIds.length ?? 0;
  const size = summary ? ` · ${formatBytes(summary.size)}` : '';
  return {
    totals:
      offline || here === 0 ? `${episodeCount(offline ? here : count)}${size}` : `${here} of ${count} episodes${size}`,
    status: summary && summary.state !== 'done' ? statusLine(summary, true, undefined, undefined, network) : undefined,
    progress: offline || count === 0 ? undefined : Math.min(1, here / count),
  };
}

/**
 * An episode's line: "Watched", then the download's state in the page's words ("300 MB", "Downloading 40% · 95 of 290
 * MB", "Waiting for Wi-Fi · ..."), else its size before it's here, else its length ("22 min").
 */
export function episodeLine(
  episode: BaseItemDto,
  summary: DownloadSummary | null,
  network: DownloadNetwork = 'wifi',
): string {
  const minutes = episode.RunTimeTicks ? `${Math.max(1, Math.round(episode.RunTimeTicks / 600_000_000))} min` : '';
  return [
    episode.UserData?.Played ? 'Watched' : '',
    statusLine(summary, false, undefined, episode.MediaSources?.[0]?.Size, network) ?? minutes,
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
  const wide = useWide();
  const network = useDownloadNetwork();
  const facts = showFacts(seasons, summary, data.downloaded, network);
  const expires = useGroupExpiry(accountId ? downloadGroup(accountId, { seriesId: id }) : null);
  const running = !!summary && summary.state !== 'done';

  const header = (
    <View style={styles.header}>
      {data.offline.offline && <Offline busy={data.offline.busy} retry={() => refreshKidsShow(id)} />}
      {data.error && <LoadError error={data.error} retry={() => refreshKidsShow(id)} />}
      {data.loading && count === 0 && <ActivityIndicator color={c.text} />}
      {count > 0 && show && (
        <DownloadShowHeader
          image={data.art.get(id) ?? image(posterImage(show), downloadArtWidth(false, wide))}
          name={show.Name ?? ''}
          totals={facts.totals}
          progress={facts.progress}
          progressLabel={facts.progress === undefined ? undefined : `${Math.round(facts.progress * 100)}% downloaded`}
          lines={[
            facts.status !== undefined && { text: facts.status },
            !running && expiryLine(expires, true),
            kept && KEPT_LINE,
          ]}
        />
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
      {show && <ShowMenu show={show} summary={summary} />}
      <FlatList
        {...scrollList}
        testID="kids-show-downloads"
        contentInsetAdjustmentBehavior="automatic"
        data={shown?.episodes ?? []}
        keyExtractor={(e) => e.Id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={DownloadRowGap}
        renderItem={({ item }) => (
          <EpisodeRow
            episode={item}
            show={show}
            art={data.art.get(item.Id)}
            kept={next.has(item.Id)}
            next={item.Id === data.nextId}
          />
        )}
      />
    </>
  );
}

/**
 * The header ⋯ (no title - the show header names it): the show row's menu (Keep Next 5, Whole Show, seasons, Delete
 * Downloads). Dimmed while a download starts.
 */
function ShowMenu({ show, summary }: { show: BaseItemDto; summary: DownloadSummary | null }) {
  const { open, starting, sheet } = useShowMenu(show, summary);
  return (
    <>
      <Stack.Screen
        options={{
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

const KEPT: RowLine = { text: 'Kept', tone: 'success' };

/**
 * One episode on the shared row frame: still (the next one marked NEXT), number + name, its line, its timer, "Kept" (a
 * kept show's next 5), its own download button.
 */
const EpisodeRow = memo(function EpisodeRow({
  episode,
  show,
  art,
  kept,
  next,
}: {
  episode: BaseItemDto;
  show: BaseItemDto | undefined;
  art?: string;
  /** One of a kept show's next 5. */
  kept: boolean;
  /** The episode the kid watches next. */
  next: boolean;
}) {
  const image = useImage();
  const wide = useWide();
  const accountId = useSession().active?.id;
  const group = accountId ? downloadGroup(accountId, { itemId: episode.Id }) : null;
  const summary = useDownloadSummary(group);
  const expires = useGroupExpiry(group);
  const network = useDownloadNetwork();
  const title = episode.IndexNumber !== undefined ? `${episode.IndexNumber}. ${episode.Name}` : (episode.Name ?? '');
  const line = episodeLine(episode, summary, network);
  const ask =
    kept && accountId && show
      ? (ids: readonly string[]) => confirmStopKeeping(accountId, show, episode.Name, ids)
      : undefined;
  return (
    <DownloadRowFrame
      still
      image={art ?? image(landscapeImage(episode), downloadArtWidth(true, wide))}
      mark={next && <NextMark />}
      title={title}
      lines={[line !== '' && { text: line }, expiryLine(expires), kept && KEPT]}
      slot={<DownloadButton item={episode} round label={`Download ${episode.Name}`} onDelete={ask} />}
    />
  );
});

/** "NEXT" in the still's corner: the episode the kid watches next. */
function NextMark() {
  return (
    <View style={styles.mark}>
      <Text variant="caption" style={styles.markText}>
        NEXT
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // A page's padding (not its gap: rows get the row gap, as on the Downloads tab).
  content: { padding: pageContent.padding, ...pageColumn },
  header: { gap: spacing.md, marginBottom: spacing.md },
  pills: { gap: spacing.sm, alignItems: 'center' },
  mark: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: backdrop,
  },
  markText: { color: onArtwork.fill, fontWeight: '700' },
});
