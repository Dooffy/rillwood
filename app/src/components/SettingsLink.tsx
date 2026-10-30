// SPDX-License-Identifier: GPL-3.0-or-later
// The pages Settings opens (an account, Subtitles, an option's list, Storage limit, About, Licences). Phones push their
// screen; the tablet split view (`SettingsSplit`) shows them beside the list instead, through this context.
import { router } from 'expo-router';
import { createContext, useContext } from 'react';

import type { PickerKey } from '@/pickers';

export type SettingsLink =
  | { page: 'account'; id: string }
  | { page: 'subtitles' }
  | { page: 'option'; key: PickerKey }
  | { page: 'storage' }
  | { page: 'about' }
  | { page: 'licences' }
  | { page: 'licence'; id: number };

/** Headings of the pages with a fixed title (screen header on phones, pane heading on tablets). */
export const SETTINGS_TITLES = {
  subtitles: 'Subtitles',
  storage: 'Storage limit',
  about: 'About',
  licences: 'Licences',
} as const;

/** One string per page, to compare links. */
export function linkKey(link: SettingsLink): string {
  if (link.page === 'account') return `account:${link.id}`;
  if (link.page === 'option') return `option:${link.key}`;
  if (link.page === 'licence') return `licence:${link.id}`;
  return link.page;
}

/** The page's own screen (phones, and anything outside the split view). */
function push(link: SettingsLink) {
  if (link.page === 'account') router.push({ pathname: '/account', params: { id: link.id } });
  else if (link.page === 'option') router.push({ pathname: '/option/[key]', params: { key: link.key } });
  else if (link.page === 'licence') router.push({ pathname: '/licence/[id]', params: { id: String(link.id) } });
  else
    router.push(
      ({ subtitles: '/subtitles', storage: '/download-storage', about: '/about', licences: '/licences' } as const)[
        link.page
      ],
    );
}

type Pane = {
  open: (link: SettingsLink) => void;
  /** `linkKey` of the page the list's selected row stands for (the list side only). */
  selected?: string;
};

/** Set by the split view: one value for its list (opens a page), one for its pane (opens a page over the shown one). */
export const SettingsPaneContext = createContext<Pane | null>(null);

/** Open a Settings page: in the split view's pane when there is one, else its screen. `selected`: highlight the row. */
export function useSettingsLink() {
  const pane = useContext(SettingsPaneContext);
  return {
    open: (link: SettingsLink) => (pane ? pane.open(link) : push(link)),
    selected: (link: SettingsLink) => (pane?.selected === undefined ? undefined : pane.selected === linkKey(link)),
  };
}
