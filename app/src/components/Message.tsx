// SPDX-License-Identifier: GPL-3.0-or-later
import { SymbolView } from 'expo-symbols';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isConnectionError, type ApiError } from '@/api';
import { openDownloads } from '@/navigation';
import { useSession } from '@/session';
import { minTouch, pressedOpacity, radii, spacing, useColors } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

/** Load-error copy that says what to do next: offline, a server failure, anything else (401 already signs out). */
export function loadErrorMessage(error: ApiError): string {
  if (error.kind === 'network') return "Couldn't reach the server. Check your connection and try again.";
  if (error.status !== undefined && error.status >= 500) return 'The server ran into a problem. Try again in a moment.';
  return "Couldn't load this. Try again.";
}

/**
 * The one empty / error look: secondary text that says what to do next, with an optional Retry. `fill` centres it in
 * the whole screen; `alert` has screen readers announce it (an error that appears without a screen change).
 */
export function Message({
  text,
  retry,
  fill = false,
  alert = false,
}: {
  text: string;
  retry?: () => void;
  fill?: boolean;
  alert?: boolean;
}) {
  return (
    <View style={[styles.message, fill && styles.fill]}>
      <Text secondary style={fill && styles.center} accessibilityRole={alert ? 'alert' : undefined}>
        {text}
      </Text>
      {retry && <Button title="Retry" variant="secondary" onPress={retry} />}
    </View>
  );
}

/**
 * A tab with nothing in it yet: the `Offline` card (icon in a circle, title, what shows up here, one filled action),
 * at the top under the tab's title.
 */
export function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: SymbolName;
  title: string;
  text: string;
  action?: { title: string; onPress: () => void };
}) {
  // No own side padding (unlike `Offline`): it sits in a padded `Screen`.
  return (
    <StateCard icon={icon} title={title} text={text}>
      {action && <Button title={action.title} onPress={action.onPress} />}
    </StateCard>
  );
}

/**
 * The one offline state - the server out of reach (no network, server down, timeout, TLS): a card with the wifi icon
 * in a circle, which server, what still works, Retry (filled) and Go to Downloads (text). A page that loaded keeps
 * its content instead; back online, failed screens reload by themselves. Always at the top of the screen: under a
 * tab's title, or `header` - under a floating header (detail, player).
 */
export function Offline({
  retry,
  busy = false,
  fill = false,
  header = false,
}: {
  retry: () => void;
  /** A retry is running: Retry spins. */
  busy?: boolean;
  /** Takes the screen (nothing to scroll), the card at its top. */
  fill?: boolean;
  header?: boolean;
}) {
  const { top } = useSafeAreaInsets();
  const server = useSession().active?.server.name ?? 'the server';
  return (
    <View style={[styles.top, fill && styles.grow, header && { paddingTop: top + minTouch + spacing.sm }]}>
      <StateCard
        testID="offline"
        alert
        icon={{ ios: 'wifi.slash', android: 'wifi_off' }}
        title={`Can't reach ${server}`}
        text="Check your connection, or watch something you've downloaded."
      >
        <Button title="Retry" loading={busy} onPress={retry} />
        <Pressable
          accessibilityRole="button"
          onPress={openDownloads}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <Text variant="button">Go to Downloads</Text>
        </Pressable>
      </StateCard>
    </View>
  );
}

type SymbolName = ComponentProps<typeof SymbolView>['name'];

/** Offline / empty card: icon in a circle, title, caption, actions stretched below. */
function StateCard({
  icon,
  title,
  text,
  alert = false,
  testID,
  children,
}: {
  icon: SymbolName;
  title: string;
  text: string;
  alert?: boolean;
  testID?: string;
  children?: ReactNode;
}) {
  const c = useColors();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: c.surface }]}>
      <View style={[styles.ring, { backgroundColor: c.elevated }]}>
        <SymbolView name={icon} tintColor={c.textSecondary} size={30} />
      </View>
      <View style={styles.copy} accessible accessibilityRole={alert ? 'alert' : undefined}>
        <Text variant="button" style={styles.center}>
          {title}
        </Text>
        <Text variant="caption" secondary style={styles.center}>
          {text}
        </Text>
      </View>
      {children && <View style={styles.actions}>{children}</View>}
    </View>
  );
}

/**
 * The offline state held while a retry runs (a request clears its error meanwhile), so the page behind it doesn't
 * flash in and out: `offline` to show, `busy` for Retry.
 */
export function useHeldOffline(offline: boolean, loading: boolean): { offline: boolean; busy: boolean } {
  const [held, setHeld] = useState(offline);
  if (offline && !held) setHeld(true);
  if (!offline && !loading && held) setHeld(false);
  const shown = offline || (held && loading);
  return { offline: shown, busy: shown && loading };
}

/** A load that failed: out of reach → `Offline`; else the copy for its kind with Retry (401 already signs out). */
export function LoadError({
  error,
  retry,
  fill = false,
  header = false,
}: {
  error: ApiError;
  retry: () => void;
  fill?: boolean;
  /** Offline: under a floating header (detail screens). */
  header?: boolean;
}) {
  return isConnectionError(error) ? (
    <Offline retry={retry} fill={fill} header={header} />
  ) : (
    <Message text={loadErrorMessage(error)} retry={retry} fill={fill} />
  );
}

const styles = StyleSheet.create({
  message: { gap: spacing.md, alignItems: 'flex-start' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  center: { textAlign: 'center' },
  top: { paddingHorizontal: spacing.md },
  grow: { flex: 1 },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  ring: { width: 64, height: 64, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: spacing.xs },
  actions: { alignSelf: 'stretch', gap: spacing.xs },
  link: { minHeight: minTouch, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: pressedOpacity },
});
