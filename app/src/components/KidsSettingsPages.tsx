// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode's grown-up settings (docs/context/kids.md, Entry points): the Kids Mode card at the top of Settings (start,
// or from kids mode: the way out), its Library list, an account's Kids account list (On / Off) - each list its own
// screen on phones (`/kids-library`, `/kids-account`), the pane beside Settings on tablets - and "Who's it for?" after
// signing in a user the server limits (`/kids-setup`). The card is the one place with controls inside a card and pills
// for a saved setting (CLAUDE.md §3).
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import type { ItemsResult } from '@/api';

import { homeLibraries, userViews } from '@/items';
import { AGE_STEPS, type AgeStep } from '@/kids';
import { kidsMode, setKids, useKids } from '@/kidsSettings';
import { homeHref, resetTo } from '@/navigation';
import { useSession } from '@/session';
import { useFetch } from '@/useFetch';
import { kids as kidsTheme, minTouch, pressedOpacity, radii, spacing, useColors } from '@/theme';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { Checkmark, Chevron } from './List';
import { LoadError } from './Message';
import { OptionList } from './OptionList';
import { useSettingsLink } from './SettingsLink';
import { Text } from './Text';

const AGE_CHOICES = AGE_STEPS.map((age) => ({ value: age, label: ageLabel(age) }));
const ON_OFF = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
] as const;

/** "7+". */
export function ageLabel(age: AgeStep): string {
  return `${age}+`;
}

/** Kids mode on now: the stack clears for kids Home, like an account switch. */
function enterKidsMode(accountId: string) {
  resetTo(homeHref(accountId, false));
}

/**
 * A kids account → the normal app, after asking. The server's limit stays (it's the server's), the text says so. Back:
 * Account → Kids account On.
 */
export function confirmAdultAccount(accountId: string, userName: string) {
  Alert.alert(
    `Make ${userName} an adult account?`,
    `Rillwood opens the normal app for ${userName}. What ${userName} can watch is still set on the server - change the limit there too.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Make Adult Account',
        onPress: () => {
          setKids(accountId, { account: false });
          resetTo('/home');
        },
      },
    ],
  );
}

/**
 * Settings' Kids Mode card for the active account. Kids mode off: the shared phone filter (age pills, unrated toggle) +
 * Start. Opened from kids mode (gate → Settings) on a shared phone: the same picks (they apply at once) + Switch to Adult
 * Mode. A kids account: no picks (the server filters) + Make an Adult Account + Switch Account. Back to kids mode = the header's back button.
 */
export function KidsModeCard() {
  const { active } = useSession();
  const kids = useKids(active?.id);
  const c = useColors();
  if (!active) return null;
  const id = active.id;
  const mode = kidsMode(kids);
  const account = mode === 'account';

  const heading = account
    ? { title: `${active.userName} is a kids account`, line: 'Always opens in Kids Mode' }
    : mode === 'shared'
      ? { title: 'Kids Mode is on', line: 'Showing what fits this age' }
      : { title: 'Kids Mode', line: 'Hand your phone to a kid' };

  return (
    <View style={[styles.card, { backgroundColor: c.surface }]}>
      <View style={styles.top}>
        <Avatar emoji={account ? kidsTheme.emoji.account : kidsTheme.emoji.mode} size={kidsTheme.emoji.header} />
        <View style={styles.heading}>
          <Text variant="sectionHeader" accessibilityRole="header">
            {heading.title}
          </Text>
          <Text secondary>{heading.line}</Text>
        </View>
      </View>
      {account ? (
        <Text secondary>What {active.userName} can watch is set on the server.</Text>
      ) : (
        <>
          <Pills label="Age" choices={AGE_CHOICES} value={kids.age} onChange={(age) => setKids(id, { age })} />
          <View style={styles.toggle}>
            <Text style={styles.toggleLabel}>Show unrated videos</Text>
            <Switch
              accessibilityLabel="Show unrated videos"
              value={kids.unrated}
              onValueChange={(unrated) => setKids(id, { unrated })}
              trackColor={{ true: c.success }}
            />
          </View>
          <LibraryRow picked={kids.libraries?.[0]} />
        </>
      )}
      {mode === 'off' ? (
        <Button
          title="Start Kids Mode"
          onPress={() => {
            setKids(id, { shared: true });
            enterKidsMode(id);
          }}
        />
      ) : account ? (
        <>
          <Button
            title="Make an Adult Account"
            variant="secondary"
            onPress={() => confirmAdultAccount(id, active.userName)}
          />
          <Button title="Switch Account" variant="secondary" onPress={() => router.push('/accounts')} />
        </>
      ) : (
        <Button
          title="Switch to Adult Mode"
          variant="secondary"
          onPress={() => {
            setKids(id, { shared: false });
            resetTo('/home');
          }}
        />
      )}
      {mode === 'off' && (
        <Text variant="caption" secondary>
          Hides what&apos;s above the age - it doesn&apos;t block it. For real limits, add a kids user on your server.
        </Text>
      )}
    </View>
  );
}

/** A labelled row of choice pills; the picked one is filled. One tap saves. */
function Pills<T extends string | number>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const c = useColors();
  return (
    <View style={styles.pillsBlock}>
      <Text variant="label" secondary>
        {label}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.pills}>
        {choices.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: on }}
              onPress={() => onChange(o.value)}
              style={({ pressed }) => [
                styles.pill,
                { backgroundColor: on ? c.accent : c.background },
                pressed && { opacity: pressedOpacity },
              ]}
            >
              <Text variant="button" style={{ color: on ? c.onAccent : c.text }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The libraries a kids pick can be (the ones Home shows: movies and shows), in server order. */
function useKidsLibraries() {
  const views = useFetch<ItemsResult>(userViews.path);
  return { libraries: views.data && homeLibraries(views.data.Items), error: views.error, refresh: views.refresh };
}

/** The card's Library row: the pick (or All libraries) → its list. */
function LibraryRow({ picked }: { picked: string | undefined }) {
  const c = useColors();
  const link = useSettingsLink();
  const { libraries } = useKidsLibraries();
  const to = { page: 'kids-library' } as const;
  const name = picked ? libraries?.find((l) => l.Id === picked)?.Name : 'All libraries';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Library"
      accessibilityValue={name ? { text: name } : undefined}
      onPress={() => link.open(to)}
      style={({ pressed }) => [styles.toggle, pressed && { opacity: pressedOpacity }]}
    >
      <Text style={styles.toggleLabel}>Library</Text>
      {name !== undefined && (
        <Text numberOfLines={1} style={[styles.libraryName, { color: c.textSecondary }]}>
          {name}
        </Text>
      )}
      <Chevron />
    </Pressable>
  );
}

/**
 * Kids Mode → Library: All libraries or one (`/Items` takes one `parentId`, so one keeps Home's order and paging
 * exact). Movie and show libraries only, as Home.
 */
export function KidsLibrarySettings() {
  const { active } = useSession();
  const kids = useKids(active?.id);
  const { libraries, error, refresh } = useKidsLibraries();
  if (!active) return null;
  if (!libraries) return error ? <LoadError error={error} retry={refresh} /> : null;
  const choices = [
    { value: '', label: 'All libraries' },
    ...libraries.map((l) => ({ value: l.Id, label: l.Name ?? '' })),
  ];
  return (
    <OptionList
      choices={choices}
      value={kids.libraries?.[0] ?? ''}
      onChange={(id) => setKids(active.id, { libraries: id ? [id] : undefined })}
      footer="Kids Mode shows only this library. Pick All to use every library you can see."
    />
  );
}

type Who = 'grown-up' | 'kid';

/**
 * After signing in a user the server limits (`finishSignIn`): who the account is for. "A kid" is picked already (the
 * limit is why - the note says so); Continue marks it a kids account (kids Home) or not (Home).
 */
export function WhoIsItFor() {
  const { active } = useSession();
  const [who, setWho] = useState<Who>('kid');
  const c = useColors();
  if (!active) return null;
  const choices: { value: Who; title: string; line: string; emoji?: string }[] = [
    { value: 'grown-up', title: 'A grown-up', line: 'The full app' },
    { value: 'kid', title: 'A kid', line: 'Always opens in Kids Mode', emoji: kidsTheme.emoji.account },
  ];
  const go = () => {
    setKids(active.id, { account: who === 'kid' });
    enterKidsMode(active.id);
  };
  return (
    <>
      <Text secondary>
        Signed in as {active.userName} on {active.server.name}.
      </Text>
      <View accessibilityRole="radiogroup" style={styles.who}>
        {choices.map((o) => {
          const on = o.value === who;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityLabel={o.title}
              accessibilityHint={o.line}
              accessibilityState={{ checked: on }}
              onPress={() => setWho(o.value)}
              style={({ pressed }) => [
                styles.whoCard,
                { backgroundColor: c.surface, borderColor: on ? c.accent : c.surface },
                pressed && { opacity: pressedOpacity },
              ]}
            >
              <Avatar name={active.userName} emoji={o.emoji} size={kidsTheme.emoji.header} />
              <View style={styles.heading}>
                <Text variant="button">{o.title}</Text>
                <Text secondary>{o.line}</Text>
              </View>
              <View
                style={[
                  styles.tick,
                  { borderColor: on ? c.accent : c.elevated2, backgroundColor: on ? c.accent : undefined },
                ]}
              >
                {on && <Checkmark color={c.onAccent} />}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" secondary>
        This user has a rating limit on the server, so &quot;A kid&quot; is picked. Change it later in Settings →{' '}
        {active.userName} → Kids account.
      </Text>
      <Button title="Continue" onPress={go} />
    </>
  );
}

/**
 * An account's Kids account list: On = it opens in kids mode whenever it's the active account (the server filters).
 * Turned on for the active account, kids mode starts at once.
 */
export function KidsAccountSettings({ id }: { id: string }) {
  const { accounts, active } = useSession();
  const kids = useKids(id);
  const account = accounts.find((a) => a.id === id);
  if (!account) return null;
  const change = (v: 'on' | 'off') => {
    setKids(id, { account: v === 'on' });
    if (v === 'on' && id === active?.id) enterKidsMode(id);
  };
  return (
    <OptionList
      choices={ON_OFF}
      value={kids.account ? 'on' : 'off'}
      onChange={change}
      footer={`On: opens in Kids mode whenever ${account.userName} is the active account. Off: the normal app. Either way, what ${account.userName} can watch is set on the server.`}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.cardLarge, padding: spacing.md, gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + spacing.xs },
  heading: { flex: 1, gap: 2 },
  pillsBlock: { gap: spacing.sm },
  // A long name gives way (one line) so the chevron stays.
  libraryName: { flexShrink: 1 },
  who: { gap: spacing.sm + spacing.xs },
  whoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    padding: spacing.md,
    borderRadius: radii.cardLarge,
    borderWidth: 2,
  },
  tick: {
    width: kidsTheme.who.tick,
    height: kidsTheme.who.tick,
    borderRadius: kidsTheme.who.tick / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: { flexDirection: 'row', gap: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: minTouch },
  toggleLabel: { flex: 1 },
  pill: { flex: 1, minHeight: minTouch, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
