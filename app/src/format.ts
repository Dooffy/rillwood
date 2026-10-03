// SPDX-License-Identifier: GPL-3.0-or-later
// Display formatting shared by screens and components (pure).

/** Whole minutes left, rounded up so a running item never shows "0m"; undefined when nothing is left. */
function minutesLeft(seconds: number): number | undefined {
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : undefined;
}

/** Compact time left for the progress bar: "9m", "1h 32m", "2h". */
export function formatRemaining(seconds: number): string | undefined {
  const total = minutesLeft(seconds);
  if (total === undefined) return undefined;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Spoken time left for VoiceOver: "9 minutes", "1 hour 32 minutes" ("9m" may be read as metres). */
export function spokenRemaining(seconds: number): string | undefined {
  const total = minutesLeft(seconds);
  if (total === undefined) return undefined;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  return [h > 0 ? part(h, 'hour') : undefined, m > 0 ? part(m, 'minute') : undefined].filter(Boolean).join(' ');
}
