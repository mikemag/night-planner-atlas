import { MON3, MONL, fmtDur, nightTitle } from '../model/format';
import { windowsText } from '../model/describe';
import type { Site } from '../model/night';
import {
  bestWeekends,
  CALENDAR_MONTHS,
  deriveRange,
  lunWindow,
  MAX_CALENDAR_YEAR,
  MAX_RANGE_YEAR,
  MIN_CALENDAR_YEAR,
  MIN_RANGE_YEAR,
  rangeStart,
  tonightId,
  type NightRange,
  type RangeSpec,
} from '../model/range';
import { TimeZone } from '../model/time';
import { C, readColors } from '../render/colors';
import { ctx, cv, size, sizeSurface } from '../render/surface';
import { el, scroller } from '../ui/dom';
import {
  initDarkWeekends,
  scrollToCurrentTripPeriod,
  updateDarkWeekends,
} from '../ui/dark-weekends';
import { closeDocs, docsOpen, initGuide, openDocs, updateGuideColors } from '../ui/guide';
import { updateRiverReadout } from '../ui/river-readout';
import { updateRiverMinimap } from '../ui/river-minimap';
import { updateChartLegend } from '../ui/chart-legend';
import { initSiteClock, updateSiteClock } from '../ui/site-clock';
import { calendar } from '../views/calendar';
import { lunations } from '../views/lunations';
import { river } from '../views/river';
import type { CanvasView } from '../views/view';
import type { ChartViewId, ViewId } from './settings';
import { savePreferences, type Preferences } from './personal-data';
import { S, activeFocus, data, type AppState } from './state';
import { calculationTotals, computeCachedRange } from './compute-cached';

const sizer = el('sizer');

const canvasViews: Partial<Record<ViewId, CanvasView>> = { river, calendar, lunations };

/** The canvas view for `view`, or null for a document view. */
export function canvasView(view: ViewId = S.view): CanvasView | null {
  return canvasViews[view] ?? null;
}

const thresholds = () => ({ moonAlt: S.moonAlt, crescent: S.crescent });
const remember = (key: string, value: unknown) => {
  if (!S.sharedSettings) void savePreferences({ [key]: value } as Preferences);
};

// ---------- layout and drawing

/** Match the canvas to the scroller, then lay out again. */
export function resize(): void {
  if (docsOpen() || !canvasView()) return;
  const anchor =
    S.view === 'river' && data.ready && river.hs.length === data.range?.nights.length
      ? river.anchor()
      : null;
  const lunationAnchor = S.view === 'lunations' && data.ready ? lunations.anchor() : null;
  const calendarAnchor = S.view === 'calendar' && data.ready ? calendar.anchor() : null;
  sizeSurface(scroller.clientWidth, scroller.clientHeight, window.devicePixelRatio || 1);
  if (data.ready && S.view === 'lunations') bestWeekends(data.range!, lunWindow(activeFocus()));
  syncSettingsControls();
  relayout();
  if (anchor) river.restoreAnchor(anchor);
  if (lunationAnchor) lunations.restoreAnchor(lunationAnchor);
  if (calendarAnchor) calendar.restoreAnchor(calendarAnchor);
}

/** Lay out the current view; `keepNight` scrolls that night to the top afterwards. */
export function relayout(keepNight?: number | null): void {
  const v = canvasView();
  if (!v || !data.ready) return;
  // Remove the old absolute minimap bounds before shrinking content (e.g. Month → Year).
  el('riverMinimap').hidden = true;
  v.layout();
  sizer.style.height = Math.max(0, v.total - size.H) + 'px';
  if (keepNight != null && keepNight >= 0) v.scrollTo(keepNight, true);
  draw();
}

let raf = 0;
/** Repaint on the next animation frame (repeated calls in one frame coalesce). */
export function draw(): void {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const v = canvasView();
    if (!v || !data.ready || docsOpen()) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, size.W, size.H);
    v.draw(scroller.scrollTop);
    updateRiverMinimap();
    if (v === river || v === lunations || v === calendar) {
      updateRiverReadout();
      const n = data.range!.nights[S.sel];
      if (n) {
        const expanded =
          v === lunations
            ? S.lunationsExpanded
            : v === calendar
              ? S.calZoom !== 'year' && S.calendarExpanded
              : S.riverZoom === 'month' && S.riverExpanded;
        const newMoon = v === calendar ? calendar.newMoons.has(n.id) : n.quarter === 0;
        const moonLabel = newMoon ? (v === calendar ? ' New moon.' : ' New moon night.') : '';
        const status = `${nightTitle(n)}.${moonLabel} Times in ${S.site.tz}. ${fmtDur(n.mfMs)} usable dark. ${windowsText(n)}.${expanded ? ' Expanded.' : ''}`;
        const live = el('riverSelection');
        if (live.textContent !== status) live.textContent = status;
      }
      const expandable =
        v === lunations || (v === calendar ? S.calZoom !== 'year' : S.riverZoom === 'month');
      cv.setAttribute('role', expandable ? 'button' : 'img');
      if (expandable)
        cv.setAttribute(
          'aria-expanded',
          String(
            v === lunations
              ? S.lunationsExpanded
              : v === calendar
                ? S.calendarExpanded
                : S.riverExpanded,
          ),
        );
      else cv.removeAttribute('aria-expanded');
    }
    updatePeriod();
  });
}

// ---------- selection and navigation

/** Select night `i`; `scroll` brings it into view (at the top when `top`). */
function selectState(i: number): void {
  S.sel = i;
  S.hover = null;
  S.riverReadoutSelected = true;
}

/** Select a night, carrying an open Month expansion along with keyboard navigation. */
export function select(i: number, scroll: boolean, top?: boolean): void {
  const v = canvasView();
  if (v === lunations) {
    const k = lunations.cycleFor(S.sel);
    const y = lunations.ys[k] - scroller.scrollTop;
    selectState(i);
    if (S.lunationsExpanded) {
      relayout();
      if (scroll && !top && y >= 0 && y < size.H - lunations.TOP)
        scroller.scrollTop = lunations.ys[lunations.cycleFor(i)] - y;
    }
    if (scroll) lunations.scrollTo(i, !!top);
    draw();
    return;
  }
  if (v === calendar) {
    const previous = calendar.weekFor(S.sel),
      keepY = previous ? previous.y - scroller.scrollTop : null,
      n = data.range?.nights[i],
      targetMonth = n ? `${n.y}-${String(n.m).padStart(2, '0')}` : null,
      changeMonth = S.calZoom === 'month' && targetMonth !== calendar.active()?.mo.key;
    selectState(i);
    // Keyboard/programmatic selection always uses the date's own month, not a duplicate placeholder.
    S.calendarWeek = calendar.weekFor(i, null)?.key ?? null;
    if (S.calZoom === 'year' && targetMonth) S.calendarMonth = targetMonth;
    relayout();
    const next = calendar.weekFor(i);
    if (
      S.calendarExpanded &&
      !top &&
      !changeMonth &&
      next &&
      keepY != null &&
      keepY >= 0 &&
      keepY < size.H
    ) {
      const period = calendar.periods.find((p) => p.key === targetMonth);
      scroller.scrollTop = Math.max(S.calZoom === 'month' ? (period?.y ?? 0) : 0, next.y - keepY);
    }
    if (scroll) calendar.scrollTo(i, !!top);
    draw();
    return;
  }
  const moving = v === river && S.riverZoom === 'month' && S.riverExpanded && i !== S.sel;
  const oldY = river.ys[S.sel] - scroller.scrollTop;
  const keepY =
    scroll && !top && oldY >= 0 && oldY < size.H - river.AX
      ? oldY
      : river.ys[i] - scroller.scrollTop;
  selectState(i);
  if (moving) {
    relayout();
    scroller.scrollTop = river.ys[i] - keepY;
  }
  if (scroll && v) v.scrollTo(i, !!top);
  draw();
}

/** Toggle only the chosen Month row; preserve its header before minimally revealing details. */
export function toggleRiverNight(i: number = S.sel): void {
  if (!data.ready || i < 0 || S.view !== 'river' || S.riverZoom !== 'month') return;
  const keepY = river.ys[i] - scroller.scrollTop;
  S.riverExpanded = !(S.riverExpanded && S.sel === i);
  selectState(i);
  relayout();
  scroller.scrollTop = river.ys[i] - keepY;
  if (S.riverExpanded) river.reveal(i);
  draw();
}

/** Open one night below its lunar cycle; a second activation closes it. */
export function toggleLunationsNight(i: number = S.sel): void {
  if (!data.ready || i < 0 || S.view !== 'lunations') return;
  const k = lunations.cycleFor(i);
  const keepY = lunations.ys[k] - scroller.scrollTop;
  S.lunationsExpanded = !(S.lunationsExpanded && S.sel === i);
  selectState(i);
  relayout();
  scroller.scrollTop = lunations.ys[k] - keepY;
  if (S.lunationsExpanded) lunations.reveal(i);
  else lunations.scrollTo(i, false);
  draw();
}

/** Reserve timeline space after the activated row, then reveal it without covering later dates. */
export function toggleCalendarNight(i: number = S.sel, week: string | null = S.calendarWeek): void {
  if (!data.ready || i < 0 || S.view !== 'calendar' || S.calZoom === 'year') return;
  let row = calendar.weekFor(i, week);
  if (!row) {
    calendar.scrollTo(i, true);
    row = calendar.weekFor(i);
  }
  if (!row) return;
  const keepY = row.y - scroller.scrollTop;
  S.calendarExpanded = !(S.calendarExpanded && S.sel === i);
  S.calendarWeek = row.key;
  selectState(i);
  relayout();
  const next = calendar.weekFor(i);
  if (next) scroller.scrollTop = next.y - keepY;
  if (S.calendarExpanded) calendar.reveal();
  else calendar.scrollTo(i, false);
  draw();
}

/** Single activation of a Year month opens Month with the intended evening date. */
export function openCalendarMonth(key: string, i?: number): void {
  const mo = data.range?.months.find((m) => m.key === key);
  if (!mo) return;
  const chosen = i != null && mo.idx.includes(i) ? i : mo.idx.includes(S.sel) ? S.sel : mo.idx[0];
  selectState(chosen);
  S.calendarMonth = mo.key;
  S.calendarExpanded = false;
  S.calendarWeek = null;
  setOpt('calZoom', 'month');
  calendar.scrollTo(chosen, true);
  cv.focus({ preventScroll: true });
  draw();
}

export function goTonight(): void {
  const r = data.range;
  const now = Date.now();
  const tz = data.ready && r ? r.tz : new TimeZone(S.site.tz);
  const tonight = tonightId(now, tz);
  const i = data.ready && r ? r.nights.findIndex((n) => n.id === tonight) : -1;
  if (!r || i < 0) {
    const spec = requestedRange(now, tz);
    const [y, m] = tonight.split('-').map(Number);
    const offset = (y - spec.y) * 12 + m - spec.m;
    if (offset < 0 || offset >= spec.count) {
      S.fixedRange = null;
      S.rangeShift = 0;
    }
    S.pendingNight = tonight;
    S.calendarMonth = null;
    restart();
    return;
  }
  r.tonightIdx = i;
  if (S.view === 'weekends') {
    updateDarkWeekends();
    scrollToCurrentTripPeriod();
  }
  select(i, true, true);
  if (canvasView() === river)
    scroller.scrollTop = Math.max(0, river.ys[i] - 3 * river.heights().base);
  draw();
}

/** The month shown at the top of the view. */
function currentMonthIndex(): number {
  const r = data.range;
  if (!r) return -1;
  const v = canvasView();
  const i = v ? v.topNight() : 0;
  const n = r.nights[Math.max(0, i)];
  return r.months.findIndex((mo) => mo.y === n.y && mo.m === n.m);
}

/** The chart's period label follows the scroll position. */
function updatePeriod(): void {
  const r = data.range;
  if (!data.ready || !r) return;
  if (S.view === 'calendar') {
    el('periodLabel').textContent = calendar.label();
    return;
  }
  if (S.view === 'lunations') {
    const n = r.nights[lunations.topNight()];
    el('periodLabel').textContent = n ? `${MON3[n.m - 1]} ${n.y}` : '—';
    return;
  }
  if (S.view === 'river' && S.riverZoom === 'year' && r.spec.count === CALENDAR_MONTHS) {
    el('periodLabel').textContent = String(r.spec.y);
    return;
  }
  const mo = r.months[currentMonthIndex()];
  el('periodLabel').textContent = mo ? `${MONL[mo.m - 1]} ${mo.y}` : '—';
}

// ---------- views and options

const VIEW_TITLES: Record<ViewId, string> = {
  calendar: 'Calendar',
  river: 'River',
  lunations: 'Lunations',
  weekends: 'Dark Weekends',
  notes: 'How it works',
};

type ViewOption = 'riverZoom' | 'calZoom' | 'calOrient';

/** The segmented controls for the current view's own options. */
function viewControls(): void {
  const box = el('viewCtl');
  box.textContent = '';
  const seg = <K extends ViewOption>(key: K, opts: Array<[AppState[K], string]>) => {
    const s = document.createElement('span');
    s.className = 'seg small btn-group btn-group-sm';
    s.setAttribute('role', 'group');
    s.setAttribute('aria-label', 'Period');
    for (const [val, label] of opts) {
      const b = document.createElement('button');
      b.className = 'btn btn-outline-secondary';
      b.classList.toggle('active', S[key] === val);
      b.textContent = label;
      b.dataset.val = val;
      b.dataset.option = key;
      b.setAttribute('aria-pressed', String(S[key] === val));
      b.addEventListener('click', () => {
        setOpt(key, val);
      });
      s.appendChild(b);
    }
    box.appendChild(s);
  };
  if (S.view === 'river') {
    seg('riverZoom', [
      ['year', 'Year'],
      ['month', 'Month'],
    ]);
  }
  if (S.view === 'calendar') {
    seg('calZoom', [
      ['year', 'Year'],
      ['month', 'Month'],
      ['week', 'Week'],
    ]);
  }
  box.hidden = !box.childElementCount;
}

/** Change a view option; River keeps the browsed position rather than jumping to selection. */
export function setOpt<K extends ViewOption>(key: K, val: AppState[K]): void {
  const focused = el('viewCtl').contains(document.activeElement);
  const reopening =
    key === 'riverZoom' && S.riverZoom === 'year' && val === 'month' && S.riverExpanded;
  const anchor = S.view === 'river' && data.ready ? river.anchor() : null;
  const keep = S.sel >= 0 ? S.sel : null;
  const calNight =
    S.view === 'calendar' && data.ready
      ? calendar.contains(S.sel)
        ? S.sel
        : calendar.topNight()
      : null;
  S[key] = val;
  remember(key, val);
  viewControls();
  if (focused)
    el('viewCtl')
      .querySelector<HTMLElement>(`button[data-option="${key}"][data-val="${val}"]`)
      ?.focus({ preventScroll: true });
  if (S.view === 'calendar' && data.ready) {
    if (calNight != null && key === 'calZoom') {
      const n = data.range!.nights[calNight];
      S.calendarMonth = `${n.y}-${String(n.m).padStart(2, '0')}`;
    }
    // Mode controls/legend can change the available height before ResizeObserver runs.
    resize();
    if (calNight != null) calendar.scrollTo(calNight, true);
    draw();
    return;
  }
  if (anchor) {
    relayout();
    if (reopening) river.scrollTo(S.sel, true);
    else river.restoreAnchor(anchor);
  } else relayout(keep);
}

export function setView(view: ViewId): void {
  if (view === 'notes') {
    if (S.view === 'notes') S.view = 'river';
    openDocs();
    return;
  }
  if (docsOpen()) closeDocs();
  const keep = S.sel >= 0 ? S.sel : (data.range?.tonightIdx ?? -1);
  if (view === 'calendar' && S.view !== 'calendar') {
    S.calendarMonth = null;
    S.calendarWeek = null;
  }
  if (S.view !== view) remember('view', view);
  S.view = view;
  S.hover = null;
  S.riverReadoutSelected = false;
  const v = canvasView(view);
  el('riverMinimap').hidden = view !== 'river';
  cv.setAttribute('aria-describedby', 'chartHelp riverSelection');
  el('chartHelp').textContent =
    view === 'calendar'
      ? 'Each date is the evening of its night. Muted dates belong to neighboring months; unloaded dates cannot be selected. Left and Right select nights; Up and Down move a week. In Month and Week, Enter or Space toggles the night timeline and Escape closes it. In Year, activate a month or press Enter on the selected night to open Month. New-moon labels mark the event’s local calendar date.'
      : view === 'lunations'
        ? 'Time runs from evening at the top to morning at the bottom of each cycle. Left and Right select displayed nights; Up and Down move between lunar cycles at the same offset. Enter or Space toggles the selected night’s horizontal timeline; Escape collapses it. Wider phone windows pan horizontally inside the chart.'
        : 'Arrow keys select nights and weeks. In River Month, Enter or Space toggles the selected night’s boundary times. Use the selected-night summary for the site-local windows; pointer previews do not change selection.';
  cv.setAttribute(
    'aria-label',
    view === 'calendar'
      ? 'Calendar chart. Select a night for its timeline; activate a Year month to open Month.'
      : view === 'lunations'
        ? 'Lunations chart. Select a night to expand its timeline.'
        : 'Night planner chart. Arrow keys move between nights; Enter or Space expands the selected night in River Month; Escape collapses it.',
  );
  scroller.hidden = !v;
  if (view !== 'river') {
    cv.removeAttribute('role');
    cv.removeAttribute('aria-expanded');
  }
  el('viewBody').classList.toggle('river-mode', view === 'river');
  el('viewBody').classList.toggle('lunations-mode', view === 'lunations');
  el('viewBody').classList.toggle('calendar-mode', view === 'calendar');
  el('viewBody').classList.toggle('weekends-mode', view === 'weekends');
  el('darkWeekends').hidden = view !== 'weekends';
  el('focusCtl').hidden = view === 'weekends';
  el('app').classList.toggle('calendar-app', view === 'calendar');
  el('calendarHeaders').hidden = view !== 'calendar';
  if (view !== 'calendar') el('calendarDetail').hidden = true;
  el('lunationsHeaders').hidden = view !== 'lunations';
  if (view !== 'lunations') el('lunationsDetail').hidden = true;
  el('sizer').style.width = '1px';
  scroller.scrollLeft = 0;
  if (view !== 'river') el('riverDetail').hidden = true;
  el('riverReadout').hidden = !v;
  el('riverReadout').setAttribute(
    'aria-label',
    view === 'lunations'
      ? 'Lunations readout'
      : view === 'calendar'
        ? 'Calendar readout'
        : 'River readout',
  );
  el('viewTitle').textContent = VIEW_TITLES[view];
  viewControls();
  syncSettingsControls();
  if (!data.ready) return;
  updateDarkWeekends();
  bestWeekends(data.range!, lunWindow(activeFocus()));
  if (v) {
    resize();
    if (keep >= 0) v.scrollTo(keep, true);
    draw();
  }
}

/** Start the destination chart on the trip's first night. Year modes have no night detail. */
function openTripNight(view: ChartViewId, id: string): void {
  if (!data.ready || !data.range) return;
  const i = data.range.nights.findIndex((night) => night.id === id);
  if (i < 0) return;
  selectState(i);
  if (view === 'river') {
    if (S.riverZoom === 'year') S.riverZoom = 'month';
    S.riverExpanded = true;
  } else if (view === 'calendar') {
    if (S.calZoom === 'year') S.calZoom = 'month';
    S.calendarWeek = null;
    S.calendarExpanded = true;
  } else {
    S.lunationsExpanded = true;
  }
  setView(view);
  S.riverReadoutSelected = true;
  canvasView()?.scrollTo(i, false);
  cv.focus({ preventScroll: true });
}

/** New-moon focus: ±N nights, or 0 for off. */
export function setFocus(focus: number): void {
  const anchor = S.view === 'river' && data.ready ? river.anchor() : null;
  const lunationAnchor = S.view === 'lunations' && data.ready ? lunations.anchor() : null;
  const calendarAnchor = S.view === 'calendar' && data.ready ? calendar.anchor() : null;
  S.focus = focus;
  S.focusExplicit = true;
  remember('focus', focus);
  syncSettingsControls();
  if (data.ready && data.range) {
    bestWeekends(data.range, lunWindow(activeFocus()));
    relayout(
      anchor || lunationAnchor || calendarAnchor
        ? null
        : S.sel >= 0
          ? S.sel
          : data.range.tonightIdx,
    );
    if (anchor) river.restoreAnchor(anchor);
    if (lunationAnchor) lunations.restoreAnchor(lunationAnchor);
    if (calendarAnchor) calendar.restoreAnchor(calendarAnchor);
  }
}

/** Change a planning threshold and re-derive every night (positions don't change). */
export function setThreshold(key: 'moonAlt' | 'crescent', value: number): void {
  const anchor = S.view === 'calendar' && data.ready ? calendar.anchor() : null;
  S[key] = value;
  remember(key, value);
  syncSettingsControls();
  if (data.ready && data.range) {
    deriveRange(data.range, thresholds(), lunWindow(activeFocus()));
    updateDarkWeekends();
    relayout();
    if (anchor) calendar.restoreAnchor(anchor);
  }
  updateSiteClock();
}

function requestedRange(now: number, tz: TimeZone): RangeSpec {
  return S.fixedRange ?? rangeStart(now, tz, S.rangeShift);
}

function canShiftRange(spec: RangeSpec, dir: number): boolean {
  const calendarYear = spec.count === CALENDAR_MONTHS;
  const year = spec.y + dir;
  return (
    year >= (calendarYear ? MIN_CALENDAR_YEAR : MIN_RANGE_YEAR) &&
    year <= (calendarYear ? MAX_CALENDAR_YEAR : MAX_RANGE_YEAR)
  );
}

/** Suggest the selected night's year when moving from a rolling span. */
export function rangePickerYear(): number {
  if (S.fixedRange?.count === CALENDAR_MONTHS) return S.fixedRange.y;
  const now = Date.now();
  const tz = new TimeZone(S.site.tz);
  return (data.ready && data.range?.nights[S.sel]?.y) || tz.wallParts(now).y;
}

/** Choose the current rolling span or a fixed January–December year. */
export function chooseRange(year?: number): void {
  S.fixedRange = year === undefined ? null : { y: year, m: 1, count: CALENDAR_MONTHS };
  S.rangeShift = 0;
  restart();
}

/** Load the same span a year earlier or later. */
export function shiftRange(dir: number): void {
  const spec = requestedRange(Date.now(), new TimeZone(S.site.tz));
  if (!canShiftRange(spec, dir)) return;
  if (S.fixedRange) S.fixedRange = { ...spec, y: spec.y + dir };
  else S.rangeShift += dir;
  restart();
}

// ---------- site

export function siteLabel(): void {
  // The picker owns the in-memory favorites, including changes storage could not keep.
  window.dispatchEvent(new Event('npa-site-change'));
  updateSiteClock();
}

export function applySite(site: Site): void {
  S.site = site;
  siteLabel();
  restart();
}

// ---------- computing the range

let computeToken = 0;

/** Compute the range for the current site; the previous range stays on screen until it's done. */
export function restart(): void {
  const prev = data.range;
  const selId =
    S.pendingNight ?? (S.sel >= 0 && prev && prev.nights[S.sel] ? prev.nights[S.sel].id : null);
  const now = Date.now();
  const spec = requestedRange(now, new TimeZone(S.site.tz));
  data.ready = false;
  el('darkWeekends').inert = true;
  el('loading').hidden = false;
  window.dispatchEvent(new Event('npa-loading'));
  el<HTMLButtonElement>('shareBtn').disabled = true;
  el<HTMLButtonElement>('calendarExportBtn').disabled = true;
  el<HTMLButtonElement>('rangePrev').disabled = !canShiftRange(spec, -1);
  el<HTMLButtonElement>('rangeNext').disabled = !canShiftRange(spec, 1);
  el('loadingText').textContent = 'Computing sun and moon for each night…';
  el('loadingBar').style.width = '0%';
  const token = ++computeToken;
  computeCachedRange(S.site, spec, thresholds(), lunWindow(activeFocus()), now, {
    isCancelled: () => token !== computeToken,
    onStats: (stats) => {
      if (token === computeToken) data.computation = stats;
    },
    onProgress: (done, total) => {
      el('loadingBar').style.width = ((100 * done) / total).toFixed(0) + '%';
    },
  })
    .then((r) => {
      if (!r || token !== computeToken) return;
      // Controls remain usable while positions compute; publish the latest planning choices.
      deriveRange(r, thresholds(), lunWindow(activeFocus()));
      data.range = r;
      S.pendingNight = null;
      data.ready = true;
      el('darkWeekends').inert = false;
      el<HTMLButtonElement>('shareBtn').disabled = false;
      el<HTMLButtonElement>('calendarExportBtn').disabled = false;
      el('loading').hidden = true;
      const { spec, nights } = r;
      const last = nights[nights.length - 1];
      el('rangeLabel').textContent =
        spec.count === CALENDAR_MONTHS
          ? `Jan – Dec ${spec.y}`
          : `${MON3[spec.m - 1]} ${spec.y} – ${MON3[last.m - 1]} ${last.y}`;
      let i = selId ? nights.findIndex((n) => n.id === selId) : -1;
      if (i < 0) i = r.tonightIdx >= 0 ? r.tonightIdx : 0;
      if (!selId || nights[i].id !== selId) {
        S.riverExpanded = false;
        S.lunationsExpanded = false;
        S.calendarExpanded = false;
        S.calendarWeek = null;
        S.calendarMonth = null;
      }
      S.sel = i;
      if (!docsOpen()) setView(S.view);
      const v = docsOpen() ? null : canvasView();
      if (v) {
        if (v === river) scroller.scrollTop = Math.max(0, river.ys[i] - 3 * river.heights().base);
        else v.scrollTo(i, true);
      }
      draw();
      window.dispatchEvent(new Event('npa-ready'));
    })
    .catch(() => {
      if (token !== computeToken) return;
      // Library errors can contain site inputs; keep them out of logs.
      el('loadingText').textContent =
        `Couldn't compute nights for ${S.site.name}. Check the site's time zone and coordinates.`;
    });
}

// ---------- boot

/** Colors changed with the theme: re-read them and repaint. */
export function onTheme(): void {
  readColors();
  updateGuideColors();
  if (data.ready) draw();
}

export function syncSettingsControls(): void {
  updateChartLegend();
  for (const x of el('focusSeg').children) {
    const focus = Number((x as HTMLElement).dataset.val);
    x.setAttribute('aria-pressed', String(focus === activeFocus()));
    x.classList.toggle('active', focus === activeFocus());
    if (focus === 0) {
      const label = S.view === 'lunations' ? 'Full cycle' : 'Off';
      if (x.textContent !== label) x.textContent = label;
    }
  }
  el<HTMLSelectElement>('moonAltSel').value = String(S.moonAlt);
  el<HTMLSelectElement>('crescentSel').value = String(S.crescent);
  el('moonSettingsSummary').textContent =
    `Moonlight: edge ${S.moonAlt}° · ${S.crescent ? `ignore under ${Math.round(S.crescent * 100)}% lit` : 'strict'}`;
  for (const b of el('viewSeg').children) {
    b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.view === S.view));
    b.classList.toggle('active', (b as HTMLElement).dataset.view === S.view);
  }
}

export function boot(): void {
  const oldNotes = S.view === 'notes';
  if (oldNotes) S.view = 'river';
  readColors();
  siteLabel();
  initSiteClock();
  initDarkWeekends(openTripNight);
  syncSettingsControls();
  exposeTestHooks();
  setView(S.view);
  initGuide(() => {
    if (data.range) {
      updateDarkWeekends();
      const unlaid = canvasView()?.total === 0;
      resize();
      if (unlaid && S.sel >= 0) canvasView()?.scrollTo(S.sel, false);
    } else restart();
  }, oldNotes);
  if (!docsOpen()) restart();
  else el('loading').hidden = true;
}

export interface TestHooks {
  readonly computation: typeof data.computation;
  readonly calculatedNights: number;
  S: typeof S;
  select: typeof select;
  setView: typeof setView;
  setOpt: typeof setOpt;
  toggleRiverNight: typeof toggleRiverNight;
  toggleLunationsNight: typeof toggleLunationsNight;
  toggleCalendarNight: typeof toggleCalendarNight;
  openCalendarMonth: typeof openCalendarMonth;
  readonly calendarRows: {
    blocks: typeof calendar.blocks;
    geometry: ReturnType<typeof calendar.cols>;
    axis: number;
    clock: typeof calendar.weekAxis;
    body: typeof calendar.weekBody;
    periods: typeof calendar.periods;
    annotations: typeof calendar.annotations;
    detailTop: typeof calendar.detailTop;
  };
  readonly lunationRows: {
    tops: number[];
    heights: number[];
    geometry: ReturnType<typeof lunations.geom>;
    cycles: typeof lunations.cycles;
  };
  readonly riverRows: { tops: Float64Array; heights: Float64Array; header: number };
  relayout: typeof relayout;
  draw: typeof draw;
  goTonight: typeof goTonight;
  readonly nights: NightRange['nights'];
  readonly ax: NightRange['ax'] | null;
  readonly lunations: NightRange['lunations'];
}

declare global {
  interface Window {
    /** State and actions for end-to-end tests; `npa-ready` fires on window once nights are computed. */
    __npa?: TestHooks;
  }
}

function exposeTestHooks(): void {
  window.__npa = {
    get calculatedNights() {
      return calculationTotals.nights;
    },
    get computation() {
      return data.computation;
    },
    S,
    select,
    toggleCalendarNight,
    openCalendarMonth,
    get calendarRows() {
      return {
        blocks: calendar.blocks,
        geometry: calendar.cols(),
        axis: calendar.TOP,
        clock: calendar.weekAxis,
        body: calendar.weekBody,
        periods: calendar.periods,
        annotations: calendar.annotations,
        detailTop: calendar.detailTop,
      };
    },
    setView,
    setOpt,
    toggleRiverNight,
    toggleLunationsNight,
    get lunationRows() {
      return {
        tops: lunations.ys,
        heights: lunations.hs,
        geometry: lunations.geom(),
        cycles: lunations.cycles,
      };
    },
    get riverRows() {
      return { tops: river.ys, heights: river.hs, header: river.detailHeader };
    },
    relayout,
    draw,
    goTonight,
    get nights() {
      return data.range?.nights ?? [];
    },
    get ax() {
      return data.range?.ax ?? null;
    },
    get lunations() {
      return data.range?.lunations ?? [];
    },
  };
}
