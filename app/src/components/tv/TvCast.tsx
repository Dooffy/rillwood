// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV Cast & Crew (screen draft 08): round photos (initials without one), name and role under them. Focusable
// so the shelf scrolls - focus grows the photo with a white ring; a click does nothing yet (no person screen).
// Virtualised: a film can list 100+ people, only the ones near the screen are drawn.
import { memo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { PersonDto } from '@/api';
import { personImage, personRole } from '@/items';
import { tv, useColors } from '@/theme';
import { useImage } from '@/useImage';

import { Avatar } from '../Avatar';
import { Text } from '../Text';
import { focusStyles } from './focus';
import { TvShelf, tvShelfListContent } from './TvShelf';

const Gap = () => <View style={styles.gap} />;

const ITEM = tv.person.cardWidth + tv.shelf.gap;

const TvPersonCard = memo(function TvPersonCard({
  name,
  role,
  image,
}: {
  name: string;
  role?: string;
  image?: string;
}) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={role ? `${name}, ${role}` : name} style={styles.card}>
      {({ focused }) => (
        <>
          <View style={[styles.ring, { borderColor: focused ? c.text : 'transparent' }, focused && focusStyles.card]}>
            <Avatar name={name} image={image} size={tv.person.size} />
          </View>
          <Text numberOfLines={2} style={[tv.type.cardTitle, styles.center]}>
            {name}
          </Text>
          {role !== undefined && (
            <Text secondary numberOfLines={2} style={[tv.type.small, styles.center]}>
              {role}
            </Text>
          )}
        </>
      )}
    </Pressable>
  );
});

/** "Cast & Crew" shelf; nothing when there are no people. */
export function TvCast({ people }: { people: PersonDto[] }) {
  const image = useImage();
  if (people.length === 0) return null;
  return (
    <TvShelf
      title="Cast & Crew"
      list={
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={people}
          keyExtractor={(p, i) => `${p.Id}-${p.Type}-${i}`}
          initialNumToRender={10}
          getItemLayout={(_, index) => ({ length: ITEM, offset: tv.margin + ITEM * index, index })}
          ItemSeparatorComponent={Gap}
          contentContainerStyle={tvShelfListContent}
          renderItem={({ item: p }) => (
            <TvPersonCard name={p.Name} role={personRole(p)} image={image(personImage(p), tv.person.size)} />
          )}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  card: { width: tv.person.cardWidth, alignItems: 'center', gap: tv.gap.sm / 2 },
  ring: { borderRadius: tv.person.size, borderWidth: tv.profile.ring, padding: tv.profile.ring },
  center: { textAlign: 'center' },
  gap: { width: tv.shelf.gap },
});
