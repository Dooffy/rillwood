// SPDX-License-Identifier: GPL-3.0-or-later
// Design tokens (CLAUDE.md §3). Screens use these, never raw values.
import { createContext, useContext, useSyncExternalStore } from 'react';
import { Dimensions, Platform } from 'react-native';

const dark = {
  background: '#000000',
  surface: '#1C1C1E',
  elevated: '#2C2C2E',
  elevated2: '#3A3A3C',
  separator: '#38383A',
  text: '#FFFFFF',
  textSecondary: '#98989F',
  iconInactive: '#8E8E93',
  accent: '#FFFFFF',
  onAccent: '#000000',
  danger: '#FF453A',
  /** Soon (a download expiring within a day). */
  warning: '#FF9F0A',
  success: '#30D158',
};

export type Colors = typeof dark;

const light: Colors = {
  background: '#FFFFFF',
  surface: '#F2F2F7',
  elevated: '#E5E5EA',
  elevated2: '#D1D1D6',
  separator: '#C6C6C8',
  text: '#000000',
  textSecondary: '#6C6C70',
  iconInactive: '#8E8E93',
  accent: '#000000',
  onAccent: '#FFFFFF',
  danger: '#FF3B30',
  warning: '#C93400',
  success: '#34C759',
};

export const palettes = { dark, light } as const;

export type Scheme = keyof typeof palettes;

/** Appearance setting + system scheme → scheme. System scheme unknown → dark. */
export function resolveScheme(appearance: 'system' | Scheme, system: Scheme | null | undefined): Scheme {
  return appearance === 'system' ? (system ?? 'dark') : appearance;
}

// Resolved once in the root layout. Wrap a subtree in another provider to force a palette (player is always dark).
export const ColorsContext = createContext<Colors>(dark);

export function useColors(): Colors {
  return useContext(ColorsContext);
}

/** Active scheme, for per-scheme assets (`assets[useScheme()]`). */
export function useScheme(): Scheme {
  return useColors() === palettes.light ? 'light' : 'dark';
}

/** On artwork (posters, backdrops): the image is the background, so these stay the same in both themes. */
export const onArtwork = {
  fill: '#FFFFFF',
  track: 'rgba(255, 255, 255, 0.35)',
  /** Bottom fade under the progress bar so it reads on bright art (Apple TV style). */
  fade: 'linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.35) 45%, rgba(0, 0, 0, 0.75) 100%)',
} as const;

/** Glass controls over video where Liquid Glass isn't available (Android, iOS < 26): see-through, no blur. */
export const glassFallback = 'rgba(255, 255, 255, 0.18)';

/** Stand-in picture behind the subtitle preview (Settings → Subtitles): a dim scene, the same in both themes. */
export const subtitlePreviewScene = 'linear-gradient(to bottom, #4A5A6E 0%, #26303C 55%, #0E1116 100%)';

/** Subtitle preview edges, as the player draws them (native `setSubtitleStyle` in modules/mpv, docs/context/mpv.md). */
export const subtitleEdge = {
  outline: '#000000',
  shadow: 'rgba(0, 0, 0, 0.75)', // mpv #C0000000
  box: 'rgba(0, 0, 0, 0.6)', // mpv #99000000
} as const;

/** Dims the screen behind a sheet or menu, in both themes. */
export const backdrop = 'rgba(0, 0, 0, 0.5)';

/** Text on a danger fill (swipe-to-delete action), in both themes. */
export const onDanger = '#FFFFFF';

/** Ukraine's flag (Settings → About), the same in both themes. */
export const flagUkraine = { blue: '#0057B7', yellow: '#FFD500' } as const;

export const radii = {
  card: 12,
  cardLarge: 20,
  pill: 999,
} as const;

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' },
  sectionHeader: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 17, fontWeight: '400' },
  button: { fontSize: 17, fontWeight: '600' },
  label: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;

export const minTouch = 44;

/** Width from which a screen uses its wide (tablet) layout: Android's sw600dp, every iPad. */
export const WIDE_MIN_WIDTH = 600;

/**
 * Width from which a wide layout puts content side by side in two columns (detail hero + credits, Details): a 13" iPad
 * in portrait, every iPad in landscape. Smaller tablet windows (11" portrait, Split View, Stage Manager) keep one column.
 */
export const TWO_COLUMNS_MIN_WIDTH = 900;

/** Widest a column of content gets on a wide screen, so lines and fields stay readable: forms (auth) and pages. */
export const readableWidth = { form: 480, page: 680 } as const;

type Size = { width: number; height: number };

export function isWide(width: number): boolean {
  return width >= WIDE_MIN_WIDTH;
}

/** A wide window wider than tall: a tablet in landscape (fixed tabs sidebar, Settings split view). */
export function isWideLandscape(width: number, height: number): boolean {
  return isWide(width) && width > height;
}

/**
 * A tablet: the screen's short side is tablet-sized (every iPad; the largest phone is 440 pt). The screen, not the
 * window: a narrow Split View window on an iPad is still a tablet, a phone turned sideways in the player is not.
 */
export function isTabletScreen({ width, height }: Size): boolean {
  return isWide(Math.min(width, height));
}

const subscribeWindow = (onChange: () => void) => {
  const sub = Dimensions.addEventListener('change', onChange);
  return () => sub.remove();
};

/**
 * A yes / no about a tablet's window - always no on a phone, so a phone turned in the player never switches the
 * screens under it. Re-renders only when the answer flips, not on every resize (Split View drags).
 */
function useTabletWindowIs(test: (window: Size) => boolean): boolean {
  return useSyncExternalStore(
    subscribeWindow,
    () => isTabletScreen(Dimensions.get('screen')) && test(Dimensions.get('window')),
  );
}

const wideWindow = ({ width }: Size) => isWide(width);
const wideLandscapeWindow = ({ width, height }: Size) => isWideLandscape(width, height);

/** Tablet-sized window (follows rotation and Split View / Stage Manager resizes). */
export function useWide(): boolean {
  return useTabletWindowIs(wideWindow);
}

export function useWideLandscape(): boolean {
  return useTabletWindowIs(wideLandscapeWindow);
}

const twoColumnWindow = ({ width }: Size) => width >= TWO_COLUMNS_MIN_WIDTH;

/** A tablet window wide enough for two columns side by side (`TWO_COLUMNS_MIN_WIDTH`). */
export function useTwoColumns(): boolean {
  return useTabletWindowIs(twoColumnWindow);
}

/** Opacity of a pressed button, card or row. */
export const pressedOpacity = 0.5;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
} as const;

/** Every vertical list: no scroll bar. */
export const scrollList = { showsVerticalScrollIndicator: false } as const;

/**
 * A vertical list on a tab screen: also clear of the tab bar. iOS native tabs inset only a screen's first scroll view
 * (on Library that's the type chips), so each list asks for it; Android pads the bottom itself.
 */
export const tabList = { ...scrollList, contentInsetAdjustmentBehavior: 'automatic' } as const;

/**
 * Apple TV: a 1920 × 1080 pt screen seen from the sofa, so its own type scale and sizes (screen drafts:
 * docs/research/apple-tv-screens.html). Focus = scale up + lift; buttons turn the palette's text colour (text fields keep the system's look).
 */
export const tv = {
  type: {
    title: { fontSize: 76, fontWeight: '700', letterSpacing: -1 },
    body: { fontSize: 29, fontWeight: '400' },
    small: { fontSize: 23, fontWeight: '400' },
    button: { fontSize: 31, fontWeight: '600' },
    caption: { fontSize: 25, fontWeight: '400' },
    /** Quiet (text-only) buttons and field labels. */
    quiet: { fontSize: 27, fontWeight: '600' },
    label: { fontSize: 23, fontWeight: '600' },
    /** Text in a TV text field's capsule (we draw it; the typing field has no style). */
    field: { fontSize: 33, fontWeight: '400' },
    /** Shelf title (Home rows). */
    shelf: { fontSize: 38, fontWeight: '700' },
    /** Title under a card. */
    cardTitle: { fontSize: 25, fontWeight: '600' },
    /** Quick Connect code. */
    code: { fontSize: 130, fontWeight: '800', letterSpacing: 10, fontVariant: ['tabular-nums'] },
  },
  /** Safe margins from the screen edge (tvOS overscan). */
  margin: 90,
  marginTop: 60,
  /** Between the two halves of a split screen (Sign in). */
  columnGap: 120,
  /** Raised surface over the background (Quick Connect code, password form). */
  panel: { radius: 36, padding: 70, minHeight: 480 },
  gap: { sm: 26, lg: 44 },
  button: { height: 86, paddingHorizontal: 44 },
  quietButton: { height: 70, paddingHorizontal: 30 },
  icon: { button: 26, field: 34 },
  /** Sunken fill + hairline so a field reads as "type here" (the system draws its own pill on focus). */
  field: {
    height: 96,
    iconInset: 32,
    /** Sunken fill + hairline so the capsule reads as "type here"; focused it turns the text colour (white). */
    fill: 'rgba(0, 0, 0, 0.45)',
    hairline: 'rgba(255, 255, 255, 0.1)',
  },
  /** Form column (Welcome, Sign in). */
  formWidth: 900,
  /** Longest line of centred copy. */
  textWidth: 1400,
  /** Full-screen artwork behind a form (Welcome). */
  backdropOpacity: 0.35,
  markSize: 120,
  /** Profile button (Home, top right, beside the tab bar). */
  avatar: 66,
  /** Space the system's top tab bar takes over content that starts under it (Home with no hero). */
  tabBarInset: 150,
  /** Full-screen hero (Home): how much of the first shelf peeks in under it, its text column. */
  hero: { peek: 300, textWidth: 1000 },
  /** Who's Watching: the account circles, the gap between them, the focus ring. */
  profile: { avatar: 240, gap: 80, ring: 6 },
  /** Menus (`TvMenu`): the card's width. */
  menu: { width: 760 },
  /** Card shelves: about this wide (whole cards across, `fitCards`), the gap, room above / below for a focused card. */
  shelf: { posterWidth: 250, landscapeWidth: 400, gap: 40, focusRoom: 40 },
  /** Active-server dot (Sign in). */
  statusDot: 12,
  /** Unfocused button fill over any background. */
  unfocused: 'rgba(255, 255, 255, 0.14)',
  focus: {
    buttonScale: 1.08,
    cardScale: 1.1,
    shadow: { shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 16 } },
  },
} as const;

/**
 * Sizes shared components take on Apple TV, picked here once (docs/decisions/tv-code-structure.md rule 3) so the
 * components don't check the platform. Getters, read on use: tests switch `Platform.isTV`.
 */
export const deviceSizes = {
  /** Text under a card's artwork (`Card`); undefined = the phone's `label` / `caption`. */
  get cardTitle() {
    return Platform.isTV ? tv.type.cardTitle : undefined;
  },
  get cardSubtitle() {
    return Platform.isTV ? tv.type.small : undefined;
  },
  /**
   * The status over card artwork (`Artwork`: progress bar + time left, "✓ Watched") on Apple TV: a thicker bar, TV
   * caption text, more inset. undefined on phones and tablets (the component's own sizes).
   */
  get artworkStatus() {
    return Platform.isTV
      ? { barHeight: 8, text: { fontSize: tv.type.caption.fontSize }, icon: 22, inset: 20, gap: tv.gap.sm / 2 }
      : undefined;
  },
  /**
   * Tab shelves (`useShelfCards`) on Apple TV: the screen's safe margin, the card widths whole cards are fitted to, the
   * gap. null on phones and tablets (sized from the tab's width).
   */
  get tvShelf() {
    return Platform.isTV
      ? { margin: tv.margin, poster: tv.shelf.posterWidth, landscape: tv.shelf.landscapeWidth, gap: tv.shelf.gap }
      : null;
  },
};
