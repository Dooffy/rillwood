// SPDX-License-Identifier: GPL-3.0-or-later
// Kids mode's grown-up settings (docs/context/kids.md, Entry points): the Kids Mode card at the top of Settings (start,
// or from kids mode: the way out) and an account's Kids account list (On / Off - its own screen on phones,
// `/kids-account`, the pane beside Settings on tablets). The card is the one place with controls inside a card and pills
// for a saved setting (CLAUDE.md §3).
import { router } from 'expo-router';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AGE_STEPS, type AgeStep } from '@/kids';
import { kidsMode, setKids, useKids } from '@/kidsSettings';
import { homeHref, resetTo } from '@/navigation';
import { useSession } from '@/session';
import { kids as kidsTheme, minTouch, pressedOpacity, radii, spacing, useColors } from '@/theme';

import { Avatar } from './Avatar';
import { Button } from './Button';
import { OptionList } from './OptionList';
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
 * Settings' Kids Mode card for the active account. Kids mode off: the shared phone filter (age pills, unrated toggle) +
 * Start. Opened from kids mode (gate → Settings) on a shared phone: the same picks (they apply at once) + Switch to Adult
 * Mode. A kids account: no picks (the server filters) + Switch Account. Back to kids mode = the header's back button.
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
        <Button title="Switch Account" variant="secondary" onPress={() => router.push('/accounts')} />
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
  pills: { flexDirection: 'row', gap: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: minTouch },
  toggleLabel: { flex: 1 },
  pill: { flex: 1, minHeight: minTouch, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
