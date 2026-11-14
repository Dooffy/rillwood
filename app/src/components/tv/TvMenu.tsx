// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV menus: drawn in the app's own view, over a dimmed screen (a popover above its button: no dim) - never an RN
// `Modal`, whose separate window the remote's presses don't reach (roadmap TV task 4b). `TvMenuHost` sits in the root
// layout; an `ActionSheet` on TV hands it what to show. Focus starts on the first action and stays in the card; Menu
// (Back) closes it.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet, TVFocusGuideView, View } from 'react-native';

import { backdrop, scrollList, tv, useColors } from '@/theme';

import { Glass } from '../Glass';
import { Text } from '../Text';
import { holdMenuKey, lastFocused, restoreFocus } from './focus';
import { TvButton } from './TvButton';

export type TvMenuAction = {
  label: string;
  detail?: string;
  selected?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

export type TvMenuProps = {
  title?: string;
  actions: TvMenuAction[];
  /** Content over the actions (a control that applies as it changes). */
  children?: ReactNode;
  /**
   * A bottom button only for a sheet whose content applies as it changes ("Done"). Menus have none, like tvOS's own
   * context menus: Menu (Back) closes them.
   */
  closeLabel?: string;
  /** A panel down the right edge instead of a centred card (Library Sort / Filter). */
  side?: boolean;
  /**
   * A small menu at the screen's bottom-right instead, its bottom edge this far up (above the button that opened it):
   * no dim, the video playing around it - the player's track buttons, like tvOS's own player.
   */
  above?: { bottom: number; right: number };
  onClose: () => void;
};

/** One per menu owner; a new owner's menu mounts afresh (focus on its first action). */
type MenuKey = { id: number };
type Host = { show: (key: MenuKey, menu: TvMenuProps) => void; hide: (key: MenuKey) => void };

let nextKey = 0;

const TvMenuContext = createContext<Host | null>(null);

/** The host for TV menus (root layout, around the navigator); off TV it only renders its children. */
export function TvMenuHost({ children }: { children: ReactNode }) {
  // The menu showing and who opened it (a closing sheet only hides its own).
  const [open, setOpen] = useState<{ key: MenuKey; menu: TvMenuProps }>();
  const host = useMemo<Host>(
    () => ({
      show: (key, menu) => setOpen({ key, menu }),
      hide: (key) => setOpen((current) => (current?.key === key ? undefined : current)),
    }),
    [],
  );
  if (!Platform.isTV) return children;
  return (
    <TvMenuContext.Provider value={host}>
      <View style={styles.fill}>
        {children}
        {open && <TvMenu key={open.key.id} {...open.menu} />}
      </View>
    </TvMenuContext.Provider>
  );
}

/** The TV host, if there is one (an `ActionSheet` without one falls back to its `Modal`). */
export function useTvMenuHost(): Host | null {
  return useContext(TvMenuContext);
}

/** Shows `menu` while `visible`, from a component that owns it (`ActionSheet` on TV). */
export function useTvMenu(host: Host | null, visible: boolean, menu: TvMenuProps) {
  // One stable key per owner.
  const [key] = useState<MenuKey>(() => ({ id: nextKey++ }));
  useEffect(() => {
    if (!host) return;
    if (visible) host.show(key, menu);
    else host.hide(key);
  });
  useEffect(() => () => host?.hide(key), [host, key]);
}

function TvMenu({ title, actions, children, closeLabel, side = false, above, onClose }: TvMenuProps) {
  const c = useColors();
  // What had focus when the menu opened (its own buttons aren't remembered): it gets focus back when the menu closes,
  // before an action runs - one that opens a screen then takes focus there.
  const [opener] = useState(lastFocused);
  // Menu (Back) closes the menu, not the screen under it: the key comes to the app while the menu is open.
  // The latest onClose (a new one each render): the key is taken once per open menu, not on every render.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const release = holdMenuKey();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      restoreFocus(opener);
      close.current();
      return true;
    });
    return () => {
      sub.remove();
      release();
    };
  }, [opener]);
  // An action closes the menu first, then runs.
  const pick = (action: TvMenuAction) => {
    restoreFocus(opener);
    onClose();
    action.onPress();
  };
  return (
    <View
      testID="tv-menu"
      style={[
        StyleSheet.absoluteFill,
        above ? [styles.popoverArea, { bottom: above.bottom, right: above.right }] : styles.backdrop,
        side && !above && styles.sideBackdrop,
      ]}
    >
      <TVFocusGuideView
        autoFocus
        trapFocusUp
        trapFocusDown
        trapFocusLeft
        trapFocusRight
        testID="tv-menu-card"
        accessibilityRole="menu"
        style={[styles.card, above ? styles.popover : side && styles.side, !above && { backgroundColor: c.elevated }]}
      >
        {/* Over the video: darkened glass, the picture blurred through it. */}
        {above && (
          <Glass
            tint={tv.menu.glassTint}
            fallback={tv.menu.glassFallback}
            style={[StyleSheet.absoluteFill, styles.glass]}
          />
        )}
        {title !== undefined && (
          <Text
            secondary={!above}
            numberOfLines={2}
            // Over video, read from the sofa: a heading ("Audio"), not a small grey caption.
            style={[above ? tv.type.shelf : tv.type.caption, !side && !above && styles.title]}
          >
            {title}
          </Text>
        )}
        {children}
        {actions.length > 0 && (
          <ScrollView
            {...scrollList}
            // Out to the card's edges: a focused button's lift and shadow fit inside the list, not cut at its edge.
            style={[styles.list, closeLabel === undefined && styles.listToBottom]}
            contentContainerStyle={styles.actions}
          >
            {actions.map((action, i) => (
              <TvButton
                // Labels can repeat (two tracks named alike).
                key={`${i}-${action.label}`}
                wide
                title={action.label}
                accessibilityLabel={action.detail ? `${action.label}, ${action.detail}` : action.label}
                icon={action.selected ? 'checkmark' : undefined}
                trailing={action.detail}
                destructive={action.destructive}
                preferredFocus={i === 0}
                rememberFocus={false}
                onPress={() => pick(action)}
              />
            ))}
          </ScrollView>
        )}
        {closeLabel !== undefined && (
          <TvButton
            variant="quiet"
            title={closeLabel}
            onPress={() => {
              restoreFocus(opener);
              onClose();
            }}
            preferredFocus={actions.length === 0}
            rememberFocus={false}
          />
        )}
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { backgroundColor: backdrop, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: tv.menu.width,
    maxHeight: '86%',
    borderRadius: tv.panel.radius,
    padding: tv.gap.lg,
    gap: tv.gap.sm,
  },
  // Full height at the right edge, its content from the top margin.
  sideBackdrop: { alignItems: 'flex-end', justifyContent: 'flex-start' },
  side: {
    width: tv.menu.sideWidth,
    height: '100%',
    maxHeight: '100%',
    borderRadius: 0,
    paddingTop: tv.marginTop,
    paddingHorizontal: tv.margin,
  },
  // Bottom-right, under the top margin at most; taps / focus outside the card reach the screen (no backdrop).
  popoverArea: { top: tv.marginTop, alignItems: 'flex-end', justifyContent: 'flex-end' },
  popover: { width: tv.menu.popoverWidth, maxHeight: '100%' },
  glass: { borderRadius: tv.panel.radius },
  title: { textAlign: 'center' },
  list: { marginHorizontal: -tv.gap.lg },
  listToBottom: { marginBottom: -tv.gap.lg },
  // Room for a focused button to grow; below it its shadow (cast down).
  actions: {
    gap: tv.gap.sm,
    paddingTop: tv.gap.sm,
    paddingBottom: tv.shelf.focusRoom,
    paddingHorizontal: tv.gap.lg,
  },
});
