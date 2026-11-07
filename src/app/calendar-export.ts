import { fmtDur, MON3, nightTitle, SUN_NAMES, WD3 } from '../model/format';
import { phaseName } from '../model/describe';
import { SUN_EVENTS, type Interval, type Night, type Thresholds } from '../model/night';
import type { NightRange } from '../model/range';
import { MS_M } from '../model/time';
import { darkWeekendPeriods } from '../model/trips';
import { COMPUTE_REVISION } from './night-cache-format';
import { createShareLink, shareRange } from './share-state';
import type { AllDayEvent } from './ical';

export const calendarKinds = ['moons', 'weekends', 'nights'] as const;
export type CalendarKind = (typeof calendarKinds)[number];
type MoonEvent = { kind: 'moons'; start: string; instant: number; night: Night | null };
type WeekendEvent = {
  kind: 'weekends';
  start: string;
  through: string;
  moon: number;
  nights: Night[];
  usable: number;
  astronomicalDarkness: number;
  partial: boolean;
};
type NightEvent = { kind: 'nights'; start: string; night: Night };
export type CalendarEvent = MoonEvent | WeekendEvent | NightEvent;

export interface ExportDates {
  from: string;
  through: string;
}

export function selectCalendarEvents(
  range: NightRange,
  { from, through }: ExportDates,
  minimumMinutes: number,
): Record<CalendarKind, CalendarEvent[]> {
  const includes = (date: string) => from <= date && date <= through;
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: range.tz.name,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const moons: MoonEvent[] = [];
  for (const q of range.quarters) {
    if (q.q !== 0) continue;
    const parts = localDate.formatToParts(q.t);
    const start = (['year', 'month', 'day'] as const)
      .map((type) =>
        parts.find((part) => part.type === type)!.value.padStart(type === 'year' ? 4 : 2, '0'),
      )
      .join('-');
    if (includes(start))
      moons.push({ kind: 'moons', start, instant: q.t, night: range.nights[q.i] ?? null });
  }
  const weekends: WeekendEvent[] = [];
  for (const period of darkWeekendPeriods(range)) {
    const pick = period.bestWeekend;
    if (!pick) continue;
    const [fri, sat] = pick.nights;
    if (includes(fri.id) && includes(sat.id))
      weekends.push({
        kind: 'weekends',
        start: fri.id,
        through: sat.id,
        moon: period.moon,
        nights: pick.nights,
        usable: pick.usable,
        astronomicalDarkness: pick.astronomicalDarkness,
        partial: period.partial,
      });
  }
  const nights: NightEvent[] = range.nights
    .filter((night) => includes(night.id) && night.mfMs > minimumMinutes * MS_M)
    .map((night) => ({ kind: 'nights', start: night.id, night }));
  return { moons, weekends, nights };
}

export function moonSettingsText({ moonAlt, crescent }: Thresholds): string {
  return `Moon upper edge above ${moonAlt}° · ${crescent ? `Ignore under ${crescent * 100}% lit` : 'Ignore faint Moon: off'}`;
}

export function calendarEventDescriptions(zone: string) {
  const options = {
    timeZone: zone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  } as const;
  const local = new Intl.DateTimeFormat('en-US', options);
  const precise = new Intl.DateTimeFormat('en-US', {
    ...options,
    year: 'numeric',
    second: '2-digit',
  });
  const utc = new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: 'UTC',
    year: 'numeric',
    second: '2-digit',
  });
  const windows = (intervals: Interval[]) =>
    intervals.map(([a, b]) => `${local.format(a)} – ${local.format(b)}`).join('\n');
  const light = (n: Night) =>
    `Moon at site-local midnight: ${Math.round(n.illum * 100)}% lit · ${phaseName(n)}`;
  const astronomicalDarkness = (n: Night) =>
    n.tdMs
      ? `Astronomical darkness: ${fmtDur(n.tdMs)}\n${windows(n.sunBelow.astronomical)}`
      : 'No astronomical darkness';
  const sky = (n: Night) => [
    ...SUN_EVENTS.map(
      (key, i) =>
        `${SUN_NAMES[i]}: ${n.ev[key] === null ? 'No event this night' : local.format(n.ev[key])}`,
    ),
    ...(['moonRise', 'moonSet'] as const).map(
      (key, i) =>
        `${i === 0 ? 'Moonrise' : 'Moonset'}: ${n[key] === null ? 'No event in the calculated window' : local.format(n[key])}`,
    ),
  ];
  const usable = (n: Night) =>
    n.mfMs ? `Usable dark: ${fmtDur(n.mfMs)}\n${windows(n.mf)}` : 'No usable dark';
  const nightHighlights = (n: Night) => [
    nightTitle(n),
    usable(n),
    astronomicalDarkness(n),
    light(n),
  ];
  return (
    event: CalendarEvent,
  ): {
    title: string;
    highlights: string[];
    details: string[];
    moonTimes?: string[];
  } => {
    if (event.kind === 'moons') {
      const moonTimes = [precise.format(event.instant), utc.format(event.instant)];
      return {
        title: 'New moon',
        moonTimes,
        highlights: [
          ...moonTimes,
          ...(event.night
            ? nightHighlights(event.night)
            : ['The associated observing night is outside the loaded range.']),
        ],
        details: event.night ? sky(event.night) : [],
      };
    }
    if (event.kind === 'nights') {
      const n = event.night;
      return {
        title: `NPA · ${fmtDur(n.mfMs)} usable dark · ${Math.round(n.illum * 100)}% Moon`,
        highlights: nightHighlights(n),
        details: sky(n),
      };
    }
    return {
      title: `Best dark weekend · ${fmtDur(event.usable)} usable dark`,
      highlights: [
        `Astronomical darkness: ${fmtDur(event.astronomicalDarkness)}`,
        ...event.nights.map((n) => `${WD3[n.dow]} ${MON3[n.m - 1]} ${n.d} · ${usable(n)}`),
      ],
      details: [
        `Best Fri–Sat by combined usable dark for the ${precise.format(event.moon)} new moon${event.partial ? ' (among loaded nights)' : ''}.`,
        ...event.nights.map((n) =>
          [nightTitle(n), astronomicalDarkness(n), light(n), ...sky(n)].join('\n'),
        ),
      ],
    };
  };
}

export function makeCalendarRecords(
  range: NightRange,
  events: CalendarEvent[],
  dates: ExportDates,
  settings: Thresholds,
  minimumMinutes: number,
  base: string,
  includeSite: boolean,
): AllDayEvent[] {
  const describe = calendarEventDescriptions(range.tz.name);
  return [...events]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((event) => {
      const { title, highlights, details, moonTimes } = describe(event);
      const night = event.kind === 'moons' ? (event.night?.id ?? event.start) : event.start;
      const url = createShareLink(base, {
        v: 1,
        ...shareRange(range.spec),
        night,
        view: 'calendar',
        riverZoom: 'month',
        calZoom: 'month',
        calOrient: 'v',
        focus: 0,
        ...settings,
        expanded: true,
        ...(includeSite ? { site: range.site } : {}),
      });
      const zone = `Site time zone: ${range.tz.name}`;
      const facts = [...highlights, ...details, zone];
      const notes = [
        ...(event.kind === 'moons' && !event.night ? [] : [moonSettingsText(settings)]),
        ...(event.kind === 'nights'
          ? [`Filter: more than ${minimumMinutes} min usable dark in total.`]
          : []),
        `Export dates: ${dates.from} through ${dates.through} · Atlas model ${COMPUTE_REVISION}`,
        includeSite
          ? 'This link includes the original site.'
          : 'This link uses your current Atlas site. Results may differ.',
        'Open in Atlas: ' + url,
      ];
      return {
        title,
        start: event.start,
        through: event.kind === 'weekends' ? event.through : event.start,
        description: [...facts, ...notes].join('\n\n'),
        // A new moon keeps its identity when its observing conditions change.
        identity: JSON.stringify([
          event.kind,
          event.start,
          title,
          moonTimes ? [...moonTimes, zone] : facts,
        ]),
        url,
      };
    });
}
