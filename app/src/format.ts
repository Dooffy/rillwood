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

/** Player clock: "4:05", "1:02:03"; "0:00" for anything not positive or finite. */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "Ends at 9:45 PM" in the device's clock format, for `seconds` of playback starting `now`. */
export function formatEndsAt(seconds: number, now: Date = new Date()): string | undefined {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const end = new Date(now.getTime() + seconds * 1000);
  return `Ends at ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A release / air date from the server ("2025-07-11T00:00:00Z"): "11 Jul 2025". The day as stored (UTC), not shifted to
 * the device's time zone - a midnight date would land on the day before west of UTC. undefined when it doesn't parse. */
export function formatDate(iso: string | undefined): string | undefined {
  const date = iso ? new Date(iso) : undefined;
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Subtitle timing: "In sync", "0.3 s earlier", "2 s later". */
export const formatDelay = (seconds: number) =>
  seconds === 0 ? 'In sync' : `${Math.abs(seconds)} s ${seconds < 0 ? 'earlier' : 'later'}`;

/** File size in decimal units, as iOS Settings shows storage: "820 MB", "4.2 GB", "128 GB". */
export function formatBytes(bytes: number): string {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (b < 999.5e6) return `${Math.round(b / 1e6)} MB`;
  const gb = b / 1e9;
  return `${gb < 100 ? Math.round(gb * 10) / 10 : Math.round(gb)} GB`;
}
