import Dropdown from 'bootstrap/js/dist/dropdown';
import { S, data } from '../app/state';
import type { ChartViewId } from '../app/settings';
import { windowsText } from '../model/describe';
import { fmtDur, MON3, WD3 } from '../model/format';
import type { Night } from '../model/night';
import { tonightId, type NightRange } from '../model/range';
import { darkWeekendPeriods, type ObservingTrip, type TripPeriod } from '../model/trips';
import { el } from './dom';
import { dropdownOptions } from './dropdown';

let renderedRange: NightRange | null = null;
let renderedKey = '';

const charts = {
  river: { label: 'River', icon: '<path d="M2 4h9M5 8h9M2 12h7"/>' },
  lunations: {
    label: 'Lunations',
    icon: '<path d="M13.7 10.2A6.2 6.2 0 0 1 5.8 2.3a6.2 6.2 0 1 0 7.9 7.9Z"/>',
  },
  calendar: {
    label: 'Calendar',
    icon: '<rect x="2" y="3.5" width="12" height="10.5" rx="1.5"/><path d="M5 2v3M11 2v3M2 7h12M5 10h1m2 0h1m2 0h1"/>',
  },
} satisfies Record<ChartViewId, { label: string; icon: string }>;

function date(night: Night): string {
  return MON3[night.m - 1] + ' ' + night.d;
}

function span(first: Night, last: Night): string {
  if (first.y !== last.y) return `${date(first)}, ${first.y} – ${date(last)}, ${last.y}`;
  return `${date(first)}–${first.m === last.m ? last.d : date(last)}`;
}

function tripDates(trip: ObservingTrip): string {
  return span(trip.nights[0], trip.nights.at(-1)!);
}

function difference(ms: number): string {
  return (ms < 0 ? '−' : '+') + fmtDur(Math.abs(ms));
}

function chartButtons(trip: ObservingTrip): string {
  const dates = tripDates(trip);
  return `<div class="trip-links" role="group" aria-label="Open ${dates} in a chart">
    ${Object.entries(charts)
      .map(
        ([view, { label, icon }]) => `<button type="button" class="btn btn-outline-secondary"
          data-trip-view="${view}" data-trip-night="${trip.nights[0].id}"
          aria-label="Open ${dates} in ${label}">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>
        </button>`,
      )
      .join('')}
  </div>`;
}

function pick(label: string, trip: ObservingTrip | null): string {
  return `<div class="trip-pick">
    <span class="trip-label">${label}</span>
    ${trip ? `<strong>${tripDates(trip)}</strong><b>${fmtDur(trip.usable)}</b><span class="trip-muted">usable dark</span>${chartButtons(trip)}` : '<span class="trip-muted">No qualifying trip</span>'}
  </div>`;
}

function score(trip: ObservingTrip, best: boolean, scale: number): string {
  return `<span class="trip-score">${fmtDur(trip.usable)}
    ${best ? '<span class="trip-badge">Best</span>' : ''}
    <span class="trip-track" aria-hidden="true"><i style="width:${(100 * trip.usable) / scale}%"></i></span>
  </span>`;
}

function nightList(trip: ObservingTrip, period: TripPeriod): string {
  return `<div class="trip-night-details">
    <p class="trip-muted">
      <strong>${trip.nights.length === 4 ? 'Thu–Sun' : 'Fri–Sat'} · ${tripDates(trip)}</strong>
      · ${fmtDur(trip.astronomicalDarkness)} astronomical darkness · ${fmtDur(trip.usable)} usable dark
      · ${fmtDur(trip.usable / trip.nights.length)} usable per night
      · ${fmtDur(trip.longest)} longest window
    </p>
    <ul>${trip.nights
      .map(
        (n) => `<li>
          <strong>${WD3[n.dow]} ${date(n)}</strong>
          <div>${windowsText(n)}
            <div class="trip-muted">${fmtDur(n.tdMs)} astronomical darkness · ${fmtDur(n.mfMs)} usable dark${n.dst ? ' · Clock change' : ''}${n.id < period.first.id || n.id > period.last.id ? ' · Outside cycle' : ''}</div>
          </div>
        </li>`,
      )
      .join('')}</ul>
  </div>`;
}

function comparisons(period: TripPeriod, open: Set<string>): string {
  const { candidates, bestWeekend, bestExtended } = period;
  if (!candidates.length)
    return '<p class="trip-muted">No complete weekends in the loaded dates.</p>';
  const id = `trip-cycle-${period.moon}`;
  const scale = Math.max(
    1,
    ...candidates.map(({ weekend, extended }) => extended?.usable ?? weekend.usable),
  );
  return `<details id="${id}" class="trip-compare"${open.has(id) ? ' open' : ''}>
    <summary>Compare ${candidates.length} ${candidates.length === 1 ? 'weekend' : 'weekends'}</summary>
    <div class="trip-columns trip-muted" aria-hidden="true">
      <span>Weekend</span><span>Fri–Sat</span><span>Thu–Sun</span><span>Add Thu + Sun</span>
    </div>
    ${candidates
      .map(({ weekend, extended }) => {
        const key = `trip-weekend-${weekend.nights[0].id}`;
        return `<details id="${key}" class="trip-candidate"${open.has(key) ? ' open' : ''}>
          <summary class="trip-columns">
            <span class="trip-date">${tripDates(weekend)}</span>
            <span class="sr-only">Fri–Sat</span>${score(weekend, weekend === bestWeekend, scale)}
            <span class="sr-only">Thu–Sun</span>${
              extended
                ? score(extended, extended === bestExtended, scale)
                : '<span class="trip-muted">Dates not loaded</span>'
            }
            <span class="sr-only">Add Thursday and Sunday</span>
            <span>${extended ? difference(extended.usable - weekend.usable) : '—'}</span>
          </summary>
          ${nightList(extended ?? weekend, period)}
          <div class="trip-candidate-links">
            <div><span class="trip-label">Fri–Sat</span>${chartButtons(weekend)}</div>
            ${extended ? `<div><span class="trip-label">Thu–Sun</span>${chartButtons(extended)}</div>` : ''}
          </div>
        </details>`;
      })
      .join('')}
  </details>`;
}

export function initDarkWeekends(openNight: (view: ChartViewId, id: string) => void): void {
  const trigger = el('tripHelpBtn');
  const popup = el('tripHelp');
  const help = new Dropdown(trigger, { ...dropdownOptions, autoClose: 'outside' });
  trigger.addEventListener('shown.bs.dropdown', () => popup.focus({ preventScroll: true }));
  trigger.addEventListener('hidden.bs.dropdown', () => {
    if (popup.contains(document.activeElement)) trigger.focus({ preventScroll: true });
  });
  el('tripHelpClose').addEventListener('click', () => help.hide());
  popup.querySelector('a')!.addEventListener('click', () => help.hide());
  el('tripPeriods').addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      'button[data-trip-view][data-trip-night]',
    );
    if (button) openNight(button.dataset.tripView as ChartViewId, button.dataset.tripNight!);
  });
}

function periodRow(period: TripPeriod, open: Set<string>, timeZone: string): string {
  const { bestWeekend, bestExtended } = period;
  const changed = bestWeekend && bestExtended && bestWeekend.nights[0] !== bestExtended.nights[1];
  const moonDate = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(period.moon);
  const moonTime = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(period.moon);
  return `<article class="trip-period" data-through="${period.last.id}" aria-labelledby="trip-moon-${period.moon}">
    <div class="trip-summary">
      <div class="trip-meta">
        <span class="trip-label">New moon</span>
        <h3 id="trip-moon-${period.moon}">${moonDate}</h3>
        <p class="trip-muted">${moonTime} · ${period.partial ? 'Partial cycle' : 'Cycle'} ${span(period.first, period.last)}</p>
        <p class="trip-muted">${fmtDur(period.astronomicalDarkness)} astronomical darkness · ${fmtDur(period.usable)} usable dark in ${period.partial ? 'loaded dates' : 'cycle'}</p>
      </div>
      ${pick('Best Fri–Sat', bestWeekend)}
      ${pick('Best Thu–Sun', bestExtended)}
    </div>
    ${
      bestWeekend && bestExtended
        ? `<p class="trip-difference">
          <span class="trip-badge${changed ? '' : ' trip-same'}">${changed ? 'Different weekend' : 'Same weekend'}</span>
          ${difference(bestExtended.usable - bestWeekend.usable)} vs. best Fri–Sat · 2 extra nights
        </p>`
        : ''
    }
    ${comparisons(period, open)}
  </article>`;
}

/** Start near tonight in the current range. Other ranges open at their first row. */
export function scrollToCurrentTripPeriod(): void {
  const range = data.range;
  if (!range) return;
  const tonight = tonightId(Date.now(), range.tz);
  const scroller = el('tripScroll');
  const rows = Array.from(scroller.querySelectorAll<HTMLElement>('.trip-period'));
  const current = rows.find((row) => row.dataset.through! >= tonight);
  scroller.scrollTop =
    current && current !== rows[0]
      ? scroller.scrollTop +
        current.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top
      : 0;
}

/** Reuse the derived nights and rebuild only when the range or Moon settings change. */
export function updateDarkWeekends(): void {
  const range = data.range;
  if (S.view !== 'weekends' || !data.ready || !range) return;
  const key = `${S.moonAlt}:${S.crescent}`;
  if (range === renderedRange && key === renderedKey) return;

  const periods = darkWeekendPeriods(range);
  const box = el('tripPeriods');
  const open = new Set<string>();
  if (range === renderedRange) {
    for (const detail of box.querySelectorAll('details[open]')) open.add(detail.id);
  } else {
    const tonight = tonightId(Date.now(), range.tz);
    const current = periods.find((period) => period.last.id >= tonight) ?? periods[0];
    if (current) open.add(`trip-cycle-${current.moon}`);
  }
  const active = document.activeElement?.closest('details');
  const focused = active && box.contains(active) ? active.id : null;
  el('tripsContext').textContent =
    `${periods.length} new moons in the loaded range · ${range.site.tz}`;
  box.innerHTML = periods.length
    ? periods.map((period) => periodRow(period, open, range.site.tz)).join('')
    : '<p class="trip-empty">No new moons in the loaded range.</p>';
  if (focused)
    document.getElementById(focused)?.querySelector('summary')?.focus({ preventScroll: true });
  if (range !== renderedRange) scrollToCurrentTripPeriod();
  renderedRange = range;
  renderedKey = key;
}
