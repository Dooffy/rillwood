// SPDX-License-Identifier: GPL-3.0-or-later
import { FlatList, StyleSheet, View } from 'react-native';

import type { PersonDto } from '@/api';
import { personImage, personRole } from '@/items';
import { useImage } from '@/useImage';

import { PersonCard, usePersonSize, WIDE_PERSON_SIZE } from './PersonCard';
import { CARD_GAP, Row, rowListContent } from './Row';

const Gap = () => <View style={styles.gap} />;

const PAD = rowListContent.paddingHorizontal;

/**
 * "Cast & Crew" shelf of round photos; nothing when there are no people. Virtualised: a film can list 100+ people, only
 * the ones near the screen are drawn (and load their photos).
 */
export function CastRow({ people }: { people: PersonDto[] }) {
  const image = useImage();
  // Width a card takes in the list, its gap included (known: lets the list skip measuring).
  const item = usePersonSize().cardWidth + CARD_GAP;
  if (people.length === 0) return null;
  return (
    <Row
      title="Cast & Crew"
      list={
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={people}
          keyExtractor={(p, i) => `${p.Id}-${p.Type}-${i}`}
          initialNumToRender={8}
          getItemLayout={(_, index) => ({ length: item, offset: PAD + item * index, index })}
          // A separator, not `gap`: gap would also space the placeholders that stand in for off-screen cards.
          ItemSeparatorComponent={Gap}
          contentContainerStyle={styles.content}
          renderItem={({ item: p }) => (
            <PersonCard name={p.Name} role={personRole(p)} image={image(personImage(p), WIDE_PERSON_SIZE)} />
          )}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: PAD },
  gap: { width: CARD_GAP },
});
