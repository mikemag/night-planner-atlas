import { MON3, MONL, fmtDur, nightTitle } from '../model/format';
import { windowsText } from '../model/describe';
import type { Site } from '../model/night';
import {
  bestWeekends,
  computeRange,
  deriveRange,
  lunWindow,
  type NightRange,
} from '../model/range';
import { C, readColors } from '../render/colors';
import { ctx, cv, size, sizeSurface } from '../render/surface';
import { el, scroller } from '../ui/dom';
import { updateWeekends } from '../ui/weekends';
import { initGuide, updateGuideColors } from '../ui/guide';
import { updateRiverReadout } from '../ui/river-readout';
import { updateRiverMinimap } from '../ui/river-minimap';
import { initSiteClock, updateSiteClock } from '../ui/site-clock';
import { hideTip } from '../ui/tooltip';
import { calendar } from '../views/calendar';
import { lunations } from '../views/lunations';
import { river } from '../views/river';
import type { CanvasView } from '../views/view';
import { store, type ViewId } from './settings';
import { S, activeFocus, data, type AppState } from './state';

const sizer = el('sizer');

const canvasViews: Partial<Record<ViewId, CanvasView>> = { river, calendar, lunations };

/** The canvas view for `view`, or null for notes. */
export function canvasView(view: ViewId = S.view): CanvasView | null {
  return canvasViews[view] ?? null;
}

const thresholds = () => ({ moonAlt: S.moonAlt, crescent: S.crescent });
const remember = (key: string, value: unknown) => {
  if (!S.sharedSettings) store.set(key, value);
};

// ---------- layout and drawing

/** Match the canvas to the scroller, then lay out again. */
export function resize(): void {
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
  if (v === lunations) {
    const hint =
      lunations.geom().width > size.W + 1
        ? 'New moon centered · Evening ↓ morning · Swipe sideways; select a night for its timeline.'
        : VIEW_INFO.lunations[1];
    if (el('viewSub').textContent !== hint) el('viewSub').textContent = hint;
  }
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
    if (!v || !data.ready) return;
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
              ? S.calZoom === 'month' && S.calendarExpanded
              : S.riverZoom === 'month' && S.riverExpanded;
        const status = `${nightTitle(n)}.${n.quarter === 0 ? ' New moon night.' : ''} Times in ${S.site.tz}. ${fmtDur(n.mfMs)} usable dark. ${windowsText(n)}.${expanded ? ' Expanded.' : ''}`;
        const live = el('riverSelection');
        if (live.textContent !== status) live.textContent = status;
      }
      const expandable =
        v === lunations || (v === calendar ? S.calZoom === 'month' : S.riverZoom === 'month');
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
  updateWeekends();
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
    const previous = calendar.weekFor(S.sel);
    const keepY = previous ? previous.y - scroller.scrollTop : null;
    selectState(i);
    const next = calendar.weekFor(i);
    S.calendarWeek = next?.key ?? null;
    if (S.calendarExpanded && S.calZoom === 'month') {
      relayout();
      const row = calendar.weekFor(i);
      if (scroll && !top && row && keepY != null && keepY >= 0 && keepY < size.H - calendar.TOP)
        scroller.scrollTop = row.y - keepY;
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

/** The activated week owns the expansion, including a dimmed neighboring-month date. */
export function toggleCalendarNight(i: number = S.sel, week: string | null = S.calendarWeek): void {
  if (!data.ready || i < 0 || S.view !== 'calendar' || S.calZoom !== 'month') return;
  const row = calendar.weekFor(i, week);
  if (!row) return;
  const keepY = row.y - scroller.scrollTop;
  S.calendarExpanded = !(S.calendarExpanded && S.sel === i && S.calendarWeek === row.key);
  S.calendarWeek = row.key;
  selectState(i);
  relayout();
  const next = calendar.weekFor(i);
  if (next) scroller.scrollTop = next.y - keepY;
  if (S.calendarExpanded) calendar.reveal(i);
  else calendar.scrollTo(i, false);
  draw();
}

/** Single activation of a Year month opens Month with the intended evening date. */
export function openCalendarMonth(key: string, i?: number): void {
  const mo = data.range?.months.find((m) => m.key === key);
  if (!mo) return;
  const chosen = i != null && mo.idx.includes(i) ? i : mo.idx.includes(S.sel) ? S.sel : mo.idx[0];
  selectState(chosen);
  S.calendarWeek = null;
  setOpt('calZoom', 'month');
  calendar.scrollTo(chosen, true);
  cv.focus({ preventScroll: true });
  draw();
}

export function goTonight(): void {
  const r = data.range;
  if (!r) return;
  const i = r.tonightIdx >= 0 ? r.tonightIdx : 0;
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

/** The header's month label follows the scroll position. */
function updatePeriod(): void {
  const r = data.range;
  if (!data.ready || !r) return;
  if (S.view === 'lunations') {
    const n = r.nights[lunations.topNight()];
    el('periodLabel').textContent = n ? `${MON3[n.m - 1]} ${n.y}` : '—';
    return;
  }
  const mo = r.months[currentMonthIndex()];
  el('periodLabel').textContent = mo ? `${MONL[mo.m - 1]} ${mo.y}` : '—';
}

/** Step the view a month (a lunation in Lunations) back or forward. */
export function stepMonth(dir: number): void {
  const r = data.range;
  if (!data.ready || !r) return;
  if (S.view === 'lunations') {
    lunations.stepCycle(dir);
    return;
  }
  const k = Math.max(0, Math.min(r.months.length - 1, currentMonthIndex() + dir));
  const i = r.months[k].idx[0];
  const v = canvasView();
  if (v === river) scroller.scrollTop = river.ys[i];
  else v?.scrollTo(i, true);
  draw();
}

// ---------- views and options

const VIEW_INFO: Record<ViewId, [string, string]> = {
  calendar: ['Calendar', 'Evening dates in complete weeks · Select a night for its timeline.'],
  river: [
    'River',
    'One row per night, clock time across — the moon’s diagonal and the seasons show as shapes.',
  ],
  lunations: [
    'Lunations',
    'New moon centered · Evening ↓ morning · Select a night for its timeline.',
  ],
  notes: ['How it works', 'Calculations, conventions, accuracy and practical help.'],
};

type ViewOption = 'riverZoom' | 'calZoom' | 'calOrient';

/** The segmented controls for the current view's own options. */
function viewControls(): void {
  const box = el('viewCtl');
  box.textContent = '';
  const seg = <K extends ViewOption>(key: K, opts: Array<[AppState[K], string]>) => {
    const s = document.createElement('span');
    s.className = 'seg small';
    for (const [val, label] of opts) {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.val = val;
      b.setAttribute('aria-pressed', String(S[key] === val));
      b.addEventListener('click', () => {
        setOpt(key, val);
      });
      s.appendChild(b);
    }
    box.appendChild(s);
    box.appendChild(document.createTextNode(' '));
  };
  if (S.view === 'river') {
    seg('riverZoom', [
      ['year', 'Year'],
      ['month', 'Month'],
    ]);
  }
  if (S.view === 'calendar') {
    seg('calZoom', [
      ['month', 'Month'],
      ['year', 'Year'],
    ]);
    if (S.calZoom === 'month')
      seg('calOrient', [
        ['v', 'Time ↓'],
        ['h', 'Time →'],
      ]);
  }
}

/** Change a view option; River keeps the browsed position rather than jumping to selection. */
export function setOpt<K extends ViewOption>(key: K, val: AppState[K]): void {
  const reopening =
    key === 'riverZoom' && S.riverZoom === 'year' && val === 'month' && S.riverExpanded;
  const anchor = S.view === 'river' && data.ready ? river.anchor() : null;
  const keep = S.sel >= 0 ? S.sel : null;
  S[key] = val;
  remember(key, val);
  viewControls();
  if (S.view === 'calendar' && data.ready) {
    const previous = key === 'calOrient' ? calendar.anchor() : null;
    relayout();
    if (previous) calendar.restoreAnchor(previous);
    else if (keep != null) calendar.scrollTo(keep, true);
    return;
  }
  if (anchor) {
    relayout();
    if (reopening) river.scrollTo(S.sel, true);
    else river.restoreAnchor(anchor);
  } else relayout(keep);
}

export function setView(view: ViewId): void {
  const keep = S.sel >= 0 ? S.sel : (data.range?.tonightIdx ?? -1);
  S.view = view;
  remember('view', view);
  S.hover = null;
  S.riverReadoutSelected = false;
  hideTip();
  for (const b of el('viewSeg').children)
    b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.view === view));
  const v = canvasView(view);
  const inline = view !== 'notes';
  el('riverMinimap').hidden = view !== 'river';
  cv.setAttribute('aria-describedby', inline ? 'chartHelp riverSelection' : 'chartHelp');
  el('chartHelp').textContent =
    view === 'calendar'
      ? 'Each date is the evening of its night. Muted dates belong to neighboring months; a dash outside the loaded range means unavailable data. Left and Right select nights; Up and Down move a week. In Month, Enter or Space toggles the selected night timeline and Escape closes it. In Year, activate a month or press Enter on the selected night to open Month.'
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
  el('calendarHeaders').hidden = view !== 'calendar';
  if (view !== 'calendar') el('calendarDetail').hidden = true;
  el('viewBody').classList.toggle('guide-mode', view === 'notes');
  el('lunationsHeaders').hidden = view !== 'lunations';
  if (view !== 'lunations') el('lunationsDetail').hidden = true;
  el('sizer').style.width = '1px';
  scroller.scrollLeft = 0;
  el('riverWeekends').hidden = view !== 'river' && view !== 'calendar';
  el('riverWeekendSlot').appendChild(el('weekendList'));
  if (view !== 'river') el('riverDetail').hidden = true;
  el('riverReadout').hidden = !inline;
  el('riverReadout').setAttribute(
    'aria-label',
    view === 'lunations'
      ? 'Lunations readout'
      : view === 'calendar'
        ? 'Calendar readout'
        : 'River readout',
  );
  el('notesView').hidden = view !== 'notes';
  el('legend').style.display = view === 'notes' ? 'none' : '';
  el('riverMoonKey').hidden = view !== 'river';
  el('durationCaption').textContent = 'Usable dark duration';
  el('periodBox').hidden = view === 'notes';
  el('planningControls').hidden = view === 'notes';
  el('viewTitle').textContent = VIEW_INFO[view][0];
  el('viewSub').textContent = VIEW_INFO[view][1];
  viewControls();
  syncSettingsControls();
  if (!data.ready) return;
  bestWeekends(data.range!, lunWindow(activeFocus()));
  if (v) {
    resize();
    if (keep >= 0) v.scrollTo(keep, true);
    draw();
  }
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
  S[key] = value;
  remember(key, value);
  if (data.ready && data.range) {
    deriveRange(data.range, thresholds(), lunWindow(activeFocus()));
    updateWeekends();
    relayout();
  }
}

/** Load the range a year earlier or later. */
export function shiftRange(dir: number): void {
  S.rangeShift += dir;
  restart();
}

// ---------- site

export function siteLabel(): void {
  // The picker owns the in-memory favorites, including changes storage could not keep.
  window.dispatchEvent(new Event('npa-site-change'));
  updateSiteClock();
}

export function applySite(site: Site, persist = true): void {
  S.site = site;
  if (persist) store.set('site', site);
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
  data.ready = false;
  el('loading').hidden = false;
  el<HTMLButtonElement>('shareBtn').disabled = true;
  el('loadingText').textContent = 'Computing sun and moon for each night…';
  el('loadingBar').style.width = '0%';
  const token = ++computeToken;
  computeRange(S.site, S.rangeShift, thresholds(), lunWindow(activeFocus()), Date.now(), {
    startMonth: S.rangeStart ? { y: S.rangeStart.y + S.rangeShift, m: S.rangeStart.m } : undefined,
    isCancelled: () => token !== computeToken,
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
      el<HTMLButtonElement>('shareBtn').disabled = false;
      el('loading').hidden = true;
      const { spec, nights } = r;
      const last = nights[nights.length - 1];
      el('rangeLabel').textContent =
        `${MON3[spec.m - 1]} ${spec.y} – ${MON3[last.m - 1]} ${last.y}`;
      let i = selId ? nights.findIndex((n) => n.id === selId) : -1;
      if (i < 0) i = r.tonightIdx >= 0 ? r.tonightIdx : 0;
      if (!selId || nights[i].id !== selId) {
        S.riverExpanded = false;
        S.lunationsExpanded = false;
        S.calendarExpanded = false;
        S.calendarWeek = null;
      }
      S.sel = i;
      updateWeekends();
      setView(S.view);
      const v = canvasView();
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
  if (data.ready) {
    updateWeekends();
    draw();
  }
}

export function syncSettingsControls(): void {
  for (const x of el('focusSeg').children) {
    const focus = Number((x as HTMLElement).dataset.val);
    x.setAttribute('aria-pressed', String(focus === activeFocus()));
    if (focus === 0) {
      const label = S.view === 'lunations' ? 'Full cycle' : 'Off';
      if (x.textContent !== label) x.textContent = label;
    }
  }
  el<HTMLSelectElement>('moonAltSel').value = String(S.moonAlt);
  el<HTMLSelectElement>('crescentSel').value = String(S.crescent);
  for (const b of el('viewSeg').children)
    b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.view === S.view));
}

export function boot(): void {
  readColors();
  siteLabel();
  initSiteClock();
  syncSettingsControls();
  initGuide();
  exposeTestHooks();
  setView(S.view);
  restart();
}

export interface TestHooks {
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
    S,
    select,
    toggleCalendarNight,
    openCalendarMonth,
    get calendarRows() {
      return { blocks: calendar.blocks, geometry: calendar.cols(), axis: calendar.TOP };
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
