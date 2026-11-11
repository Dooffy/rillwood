// SPDX-License-Identifier: GPL-3.0-or-later
// Library on phones and tablets: search field, type capsules (All / Movies / Shows / Episodes), sort, the shared filter
// sheet + removable filter tags. One type → an endless poster grid or episode list; All → grouped rows with See All.
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { BaseItemDto } from '@/api';
import { Button } from '@/components/Button';
import { LandscapeCard, PosterCard } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { FilterChips } from '@/components/FilterChips';
import { FilterButton, FilterSheet } from '@/components/FilterSheet';
import { ListRow, ListSection } from '@/components/List';
import { MenuButton } from '@/components/MenuButton';
import { loadErrorMessage, Message, Offline } from '@/components/Message';
import { PagedList } from '@/components/PagedList';
import { Row } from '@/components/Row';
import { PosterRowsPlaceholder } from '@/components/Skeleton';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { Text } from '@/components/Text';
import { useShelfCards } from '@/components/shelfCards';
import { features } from '@/device';
import { cardTitles, landscapeImage, LIBRARY_SORTS, listItems, playback, posterImage, SEARCH_SCOPES } from '@/items';
import { spacing, tabList, useColors } from '@/theme';
import { useImage } from '@/useImage';
import { countLabel, emptyText, POSTER_ROWS, useLibrary } from '@/useLibrary';

export function PhoneLibrary() {
  const lib = useLibrary();
  const { query, scope, term, groups, paged, offline } = lib;
  const image = useImage();
  const c = useColors();
  // Shelf card sizes: whole cards across the tab on tablets, as on Home.
  const { posters, landscape } = useShelfCards();
  const [focused, setFocused] = useState(false);

  const poster = (item: BaseItemDto) => (
    <PosterCard
      key={item.Id}
      width={posters.width}
      {...cardTitles(item)}
      {...playback(item)}
      image={image(posterImage(item), posters.width)}
      item={item}
      onOpen={lib.open}
      onMenu={lib.onMenu}
    />
  );

  let body;
  if (focused && lib.text.trim() === '' && lib.recent.length > 0) {
    // Typing starts: recent searches until there is a term.
    body = (
      <ScrollView {...tabList} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.padded}>
        <ListSection title="Recent">
          {lib.recent.map((t) => (
            <ListRow key={t} label={t} onPress={() => lib.setText(t)} />
          ))}
        </ListSection>
        <View style={styles.clear}>
          <Button title="Clear Recent" variant="secondary" onPress={lib.clearRecent} />
        </View>
      </ScrollView>
    );
  } else if (!lib.all) {
    body = (
      <PagedList
        list={paged}
        layout={scope === 'episodes' ? 'episodes' : 'posters'}
        listKey={lib.listKey}
        testID="library-list"
        onOpen={lib.remember}
        emptyText={emptyText(query)}
        header={
          paged.total !== undefined && paged.total > 0 ? (
            <Text variant="caption" secondary>
              {[countLabel(scope, paged.total), term ? undefined : `by ${lib.sortLabel}`].filter(Boolean).join(' · ')}
            </Text>
          ) : undefined
        }
      />
    );
  } else {
    let content;
    if (!groups) {
      content = lib.failed ? (
        <View style={styles.padded}>
          <Message text={loadErrorMessage(lib.failed)} retry={lib.retryAll} />
        </View>
      ) : (
        <PosterRowsPlaceholder rows={term ? 3 : 2} />
      );
    } else if (groups.movies.length + groups.shows.length + groups.episodes.length === 0) {
      content = (
        <View style={styles.padded}>
          <Message text={emptyText(query)} />
        </View>
      );
    } else {
      content = (
        <>
          {/* Headings select that type: the full list, scrolling down. */}
          {POSTER_ROWS.map(
            ({ key, title }) =>
              groups[key].length > 0 && (
                <Row key={key} title={title} onPress={() => lib.setScope(key)}>
                  {groups[key].map(poster)}
                </Row>
              ),
          )}
          {groups.episodes.length > 0 && (
            <Row title="Episodes" onPress={() => lib.setScope('episodes')}>
              {groups.episodes.map((ep) => (
                <LandscapeCard
                  key={ep.Id}
                  width={landscape.width}
                  {...cardTitles(ep)}
                  {...playback(ep)}
                  image={image(landscapeImage(ep), landscape.width)}
                  item={ep}
                  onOpen={lib.open}
                  onMenu={lib.onMenu}
                />
              ))}
            </Row>
          )}
        </>
      );
    }
    body = offline.offline ? (
      // Out of reach with nothing loaded: the offline card alone at the top, nothing to scroll.
      <Offline fill busy={offline.busy} retry={lib.retryAll} />
    ) : (
      <ScrollView
        {...tabList}
        testID="library-rows"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.rows}
        refreshControl={
          features.touch ? (
            <RefreshControl refreshing={lib.rows.refreshing} onRefresh={lib.rows.onRefresh} tintColor={c.text} />
          ) : undefined
        }
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <Screen
      title="Library"
      padded={false}
      right={
        lib.controls && (
          <>
            <MenuButton
              icon={{ ios: 'arrow.up.arrow.down', android: 'sort' }}
              label={`Sort: ${lib.sortLabel}`}
              title="Sort by"
              options={LIBRARY_SORTS}
              value={lib.sort}
              onChange={lib.setSort}
            />
            <FilterButton value={lib.filters} onPress={lib.openFilters} />
          </>
        )
      }
    >
      {lib.controls && (
        <View style={styles.controls}>
          <View style={styles.padded}>
            <SearchField
              value={lib.text}
              onChangeText={lib.setText}
              onSubmit={lib.submit}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Movies, shows, episodes"
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopes}>
            {SEARCH_SCOPES.map((s) => (
              <Chip key={s.key} label={s.label} selected={scope === s.key} onPress={() => lib.setScope(s.key)} />
            ))}
          </ScrollView>
          <FilterChips value={lib.filters} onChange={lib.setFilters} />
        </View>
      )}
      {body}
      <FilterSheet
        visible={lib.filtersOpen}
        value={lib.filters}
        genres={lib.genres}
        onApply={lib.setFilters}
        onClose={lib.closeFilters}
        countEndpoint={(draft) => listItems({ ...query, filters: draft }, 0)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingBottom: spacing.md, gap: spacing.sm },
  scopes: { paddingHorizontal: spacing.md, gap: spacing.sm },
  rows: { gap: spacing.lg, paddingBottom: spacing.lg },
  padded: { paddingHorizontal: spacing.md, gap: spacing.md },
  clear: { alignItems: 'flex-start' },
});
