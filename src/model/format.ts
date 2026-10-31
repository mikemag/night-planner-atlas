import { MS_H, MS_M } from './time';

export const SUN_NAMES = [
  'Sunset',
  'Civil dusk',
  'Nautical dusk',
  'Astro dusk',
  'Astro dawn',
  'Nautical dawn',
  'Civil dawn',
  'Sunrise',
];

export const WD1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MON3 = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export const MONL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const pad2 = (v: number): string => String(v).padStart(2, '0');

export interface ClockParts {
  h12: number;
  M: number;
  am: boolean;
}

/** Clock reading for `h` wall-clock hours after local noon. */
export function clockParts(h: number): ClockParts {
  let mins = Math.round((12 + h) * 60);
  mins = ((mins % 1440) + 1440) % 1440;
  const H = Math.floor(mins / 60),
    M = mins % 60;
  return { h12: H % 12 === 0 ? 12 : H % 12, M, am: H < 12 };
}

/** "8:15 PM" for hours after local noon; "—" when there is no time. */
export function fmtClock(h: number | null | undefined): string {
  if (h == null) return '—';
  const c = clockParts(h);
  return `${c.h12}:${pad2(c.M)} ${c.am ? 'AM' : 'PM'}`;
}

/** Compact "8:15p" form of {@link fmtClock}. */
export function fmtClockS(h: number | null | undefined): string {
  if (h == null) return '—';
  const c = clockParts(h);
  return `${c.h12}:${pad2(c.M)}${c.am ? 'a' : 'p'}`;
}

/** "7h 42m", "42m", "7h" or "0m". */
export function fmtDur(ms: number): string {
  const m = Math.max(0, Math.round(ms / MS_M));
  if (m < 1) return '0m';
  if (m < 60) return m + 'm';
  const H = Math.floor(m / 60),
    M = m % 60;
  return M ? `${H}h ${M}m` : `${H}h`;
}

/** Hours with one decimal ("7.7"), or "<0.1" for a sliver. */
export function fmtHrs(ms: number): string {
  return ms > 0 && ms < 0.05 * MS_H ? '<0.1' : (ms / MS_H).toFixed(1);
}

/** "Fri Oct 9 → Sat Oct 10" for the night that starts on the given evening. */
export function nightTitle(n: { y: number; m: number; d: number; dow: number }): string {
  const nx = new Date(Date.UTC(n.y, n.m - 1, n.d + 1));
  return `${WD3[n.dow]} ${MON3[n.m - 1]} ${n.d} → ${WD3[nx.getUTCDay()]} ${MON3[nx.getUTCMonth()]} ${nx.getUTCDate()}`;
}
