// SPDX-License-Identifier: GPL-3.0-or-later
import type { PersonDto } from '@/api';
import { personImage, personRole } from '@/items';
import { useImage } from '@/useImage';

import { PERSON_SIZE, PersonCard } from './PersonCard';
import { Row } from './Row';

/** "Cast & Crew" shelf of round photos; nothing when there are no people. */
export function CastRow({ people }: { people: PersonDto[] }) {
  const image = useImage();
  if (people.length === 0) return null;
  return (
    <Row title="Cast & Crew">
      {people.map((p) => (
        <PersonCard
          key={`${p.Id}-${p.Type}`}
          name={p.Name}
          role={personRole(p)}
          image={image(personImage(p), PERSON_SIZE)}
        />
      ))}
    </Row>
  );
}
