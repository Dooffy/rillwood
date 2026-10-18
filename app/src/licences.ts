// SPDX-License-Identifier: GPL-3.0-or-later
// Settings → Licences data: written on install by scripts/generate-licences.mjs (CLAUDE.md §7).
import { Platform } from 'react-native';

import data from './licences.json';

export type Licence = {
  /** Index in `LICENCES`, for links. */
  id: number;
  name: string;
  /** SPDX name(s), as the project gives them. */
  licence: string;
  /** Where the source lives. */
  url?: string;
  note?: string;
  /** Platform it ships on; unset = both. */
  platform?: 'ios' | 'android';
  /** npm packages the entry stands for ("name version"). */
  packages?: string[];
  /** Full licence texts. */
  texts: string[];
};

type Entry = Omit<Licence, 'id' | 'texts' | 'platform'> & { platform?: string; texts: number[] };

const entries: Entry[] = [data.app, ...data.native, ...data.packages];

export const LICENCES: Licence[] = entries.map((e, id) => ({
  ...e,
  id,
  platform: e.platform === 'ios' || e.platform === 'android' ? e.platform : undefined,
  texts: e.texts.map((i) => data.texts[i]),
}));

const onThisPlatform = (l: Licence) => l.platform === undefined || l.platform === Platform.OS;

/** The Licences page: Rillwood, then its native parts on this platform, then npm packages. */
export const licenceSections = {
  app: LICENCES[0],
  native: LICENCES.slice(1, 1 + data.native.length).filter(onThisPlatform),
  packages: LICENCES.slice(1 + data.native.length),
};

/** An entry by its id (a route param); undefined for an id this build doesn't have. */
export function licenceById(id: string | number | undefined): Licence | undefined {
  const i = id === '' ? NaN : Number(id);
  return Number.isInteger(i) ? LICENCES[i] : undefined;
}
