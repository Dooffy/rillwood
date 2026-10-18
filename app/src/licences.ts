// SPDX-License-Identifier: GPL-3.0-or-later
// Settings → Licences data: written on install by scripts/generate-licences.mjs (CLAUDE.md §7). The JSON (about
// 560 KB) is required on first use, not at import: the root layout and Settings import this module at launch.
import { Platform } from 'react-native';

type Data = typeof import('./licences.json');

export type Licence = {
  /** Index in `licences()`, for links. */
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

type Licences = {
  all: Licence[];
  /** The Licences page: Rillwood, then its native parts on this platform, then npm packages. */
  sections: { app: Licence; native: Licence[]; packages: Licence[] };
};

let loaded: Licences | undefined;

function load(): Licences {
  if (loaded) return loaded;
  const data: Data = require('./licences.json');
  const entries: Entry[] = [data.app, ...data.native, ...data.packages];
  const all: Licence[] = entries.map((e, id) => ({
    ...e,
    id,
    platform: e.platform === 'ios' || e.platform === 'android' ? e.platform : undefined,
    texts: e.texts.map((i) => data.texts[i]),
  }));
  const onThisPlatform = (l: Licence) => l.platform === undefined || l.platform === Platform.OS;
  loaded = {
    all,
    sections: {
      app: all[0],
      native: all.slice(1, 1 + data.native.length).filter(onThisPlatform),
      packages: all.slice(1 + data.native.length),
    },
  };
  return loaded;
}

/** Every entry, by id. */
export const licences = (): Licence[] => load().all;

/** The Licences page's sections. */
export const licenceSections = () => load().sections;

/** An entry by its id (a route param); undefined for an id this build doesn't have. */
export function licenceById(id: string | number | undefined): Licence | undefined {
  const i = id === '' ? NaN : Number(id);
  return Number.isInteger(i) ? licences()[i] : undefined;
}
