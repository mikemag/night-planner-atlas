import Dropdown from 'bootstrap/js/dist/dropdown';
import { dropdownOptions } from './dropdown';
import { S, data } from '../app/state';
import { LiveNights } from '../app/live-nights';
import type { NightRange } from '../model/range';
import { siteKey } from '../app/night-cache-format';
import {
  formatCountdown,
  formatNightStatus,
  formatSiteClock,
  nextClockTick,
  nextLiveTransition,
} from '../model/site-clock';
import { el } from './dom';

const nights = new LiveNights(updateSiteClock);
let timer: number | undefined;
const compact = matchMedia('(max-width: 700px), (max-width: 1100px) and (max-height: 500px)');
let partialSource: NightRange | null = null;
let partialRange: NightRange | null = null;
let pendingCount = -1;

function setText(id: string, value: string): void {
  const element = el(id);
  if (element.textContent !== value) element.textContent = value;
}

/** Reuse the completed rows between progress updates, including on second ticks. */
function liveRange(): NightRange | null {
  if (data.ready || !data.progressive || !data.range) {
    partialSource = partialRange = null;
    pendingCount = -1;
    return data.ready ? data.range : null;
  }
  const count = data.pending?.size ?? 0;
  if (partialSource !== data.range || pendingCount !== count) {
    partialSource = data.range;
    pendingCount = count;
    partialRange = {
      ...data.range,
      nights: data.range.nights.filter((n) => !data.pending?.has(n.id)),
    };
  }
  return partialRange;
}

export function updateSiteClock(): void {
  const now = Date.now();
  const clock = formatSiteClock(S.site.tz, now);
  const zone = clock.lastIndexOf(' · ');
  setText('siteClockTime', clock.slice(0, zone));
  setText('siteClockZone', S.site.tz);
  setText('siteClockDesktopTime', clock.slice(0, zone));
  setText('siteClockDesktopZone', S.site.tz);
  el('siteClock').title = S.site.tz;

  const status = nights.read(S.site, S, now, liveRange());
  const text = formatNightStatus(status, now, nights.finished(status, now));
  const next = nextLiveTransition(status);
  const phase = nights.unavailable && !status?.solar ? 'Phase timing unavailable' : text.phase;
  const dark =
    nights.unavailable && !status?.usable && (!status || status.usablePending)
      ? 'Usable dark timing unavailable'
      : text.dark;
  setText('siteClockCountdown', phase);
  setText('siteClockUsable', dark);
  setText('siteClockDesktopUsable', text.active ? 'Usable dark now' : '');
  let secondary = '';
  if (!text.combined) {
    if (next?.kind === 'usable') secondary = phase;
    else if (!text.active) secondary = dark;
    else if (status?.usable?.at != null)
      secondary = `${formatCountdown(status.usable.at - now)} until usable dark ends`;
  }
  setText('siteClockSecondary', secondary);
  el('siteClock').dataset.combined = text.combined;
  el('siteClockCountdown').classList.toggle('usable-now', text.active && text.combined === 'end');
  el('siteClockUsable').classList.toggle('usable-now', text.active && text.combined !== 'end');
  el('siteClockDesktopUsable').classList.toggle('usable-now', text.active);

  setText('siteClockDuration', next ? formatCountdown(next.at - now) : '');
  setText('siteClockEvent', next ? `until ${next.name}` : phase);
  setText('siteClockShared', text.combined === 'start' ? '+ usable dark' : '');

  // Let the chart supply its nights first. When browsing another year, the same acquisition
  // path supplies just the missing current months, with no separate solar or lunar solver.
  if (data.ready && data.range && siteKey(data.range.site) === siteKey(S.site))
    nights.extend(S.site, status, now);
  window.clearTimeout(timer);
  timer = window.setTimeout(updateSiteClock, nextClockTick(status, now));
}

export function initSiteClock(): void {
  const trigger = el('siteClockToggle');
  const dropdown = new Dropdown(trigger, dropdownOptions);
  const primary = el('siteClockPrimary');
  const layout = () => {
    dropdown.hide();
    if (compact.matches) trigger.appendChild(primary);
    else el('siteClock').insertBefore(primary, trigger);
    if (!compact.matches && document.activeElement === trigger) el('siteSel').focus();
    updateSiteClock();
  };
  layout();
  compact.addEventListener('change', layout);
  window.addEventListener('npa-ready', updateSiteClock);
  window.addEventListener('npa-partial', updateSiteClock);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateSiteClock();
  });
}
