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
import { inspect } from '../ui/inspector';
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
import { S, data, type AppState } from './state';

const sizer = el('sizer');

const canvasViews: Partial<Record<ViewId, CanvasView>> = { river, calendar, lunations };

/** The canvas view for `view`, or null for notes. */
export function canvasView(view: ViewId = S.view): CanvasView | null {
  return canvasViews[view] ?? null;
}

const thresholds = () => ({ moonAlt: S.moonAlt, crescent: S.crescent });

// ---------- layout and drawing

/** Match the canvas to the scroller, then lay out again. */
export function resize(): void {
  const anchor =
    S.view === 'river' && data.ready && river.hs.length === data.range?.nights.length
      ? river.anchor()
      : null;
  sizeSurface(scroller.clientWidth, scroller.clientHeight, window.devicePixelRatio || 1);
  relayout();
  if (anchor) river.restoreAnchor(anchor);
}

/** Lay out the current view; `keepNight` scrolls that night to the top afterwards. */
export function relayout(keepNight?: number | null): void {
  const v = canvasView();
  if (!v || !data.ready) return;
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
    if (v === river) {
      updateRiverReadout();
      const n = data.range!.nights[S.sel];
      if (n) {
        const status = `${nightTitle(n)}.${n.quarter === 0 ? ' New moon night.' : ''} Times in ${S.site.tz}. ${fmtDur(n.mfMs)} usable dark. ${windowsText(n)}.${S.riverZoom === 'month' && S.riverExpanded ? ' Expanded.' : ''}`;
        const live = el('riverSelection');
        if (live.textContent !== status) live.textContent = status;
      }
      cv.setAttribute('role', S.riverZoom === 'month' ? 'button' : 'img');
      if (S.riverZoom === 'month') cv.setAttribute('aria-expanded', String(S.riverExpanded));
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
  inspect(i);
}

/** Select a night, carrying an open Month expansion along with keyboard navigation. */
export function select(i: number, scroll: boolean, top?: boolean): void {
  const v = canvasView();
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
    const { rh } = lunations.geom();
    scroller.scrollTop = Math.max(0, scroller.scrollTop + dir * (rh + 10));
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
  calendar: ['Calendar', 'Each day cell holds that evening’s night; time runs down each cell.'],
  river: [
    'River',
    'One row per night, clock time across — the moon’s diagonal and the seasons show as shapes.',
  ],
  lunations: ['Lunations', 'One row per lunar cycle, aligned on new moon; weekends tinted.'],
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
        viewControls();
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
  store.set(key, val);
  if (key === 'calZoom' || key === 'calOrient') S.expandedWeek = null;
  if (anchor) {
    relayout();
    if (reopening) river.scrollTo(S.sel, true);
    else river.restoreAnchor(anchor);
  } else relayout(keep);
}

export function setView(view: ViewId): void {
  const keep = S.sel >= 0 ? S.sel : (data.range?.tonightIdx ?? -1);
  S.view = view;
  store.set('view', view);
  S.hover = null;
  S.riverReadoutSelected = false;
  hideTip();
  for (const b of el('viewSeg').children)
    b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.view === view));
  const v = canvasView(view);
  el('riverMinimap').hidden = view !== 'river';
  cv.setAttribute('aria-describedby', view === 'river' ? 'chartHelp riverSelection' : 'chartHelp');
  scroller.hidden = !v;
  if (view !== 'river') {
    cv.removeAttribute('role');
    cv.removeAttribute('aria-expanded');
  }
  el('viewBody').classList.toggle('river-mode', view === 'river');
  el('viewBody').classList.toggle('guide-mode', view === 'notes');
  el('inspector').hidden = view === 'river' || view === 'notes';
  el('riverWeekends').hidden = view !== 'river';
  el(view === 'river' ? 'riverWeekendSlot' : 'inspector').appendChild(el('weekendList'));
  if (view !== 'river') el('riverDetail').hidden = true;
  el('riverReadout').hidden = view !== 'river';
  el('notesView').hidden = view !== 'notes';
  el('legend').style.display = view === 'notes' ? 'none' : '';
  el('riverMoonKey').hidden = view !== 'river';
  el('periodBox').hidden = view === 'notes';
  el('planningControls').hidden = view === 'notes';
  el('viewTitle').textContent = VIEW_INFO[view][0];
  el('viewSub').textContent = VIEW_INFO[view][1];
  viewControls();
  if (!data.ready) return;
  if (v) {
    resize();
    if (keep >= 0) v.scrollTo(keep, true);
    draw();
  }
}

/** New-moon focus: ±N nights, or 0 for off. */
export function setFocus(focus: number): void {
  const anchor = S.view === 'river' && data.ready ? river.anchor() : null;
  S.focus = focus;
  store.set('focus', focus);
  for (const x of el('focusSeg').children)
    x.setAttribute('aria-pressed', String(Number((x as HTMLElement).dataset.val) === focus));
  if (data.ready && data.range) {
    bestWeekends(data.range, lunWindow(focus));
    relayout(anchor ? null : S.sel >= 0 ? S.sel : data.range.tonightIdx);
    if (anchor) river.restoreAnchor(anchor);
  }
}

/** Change a planning threshold and re-derive every night (positions don't change). */
export function setThreshold(key: 'moonAlt' | 'crescent', value: number): void {
  S[key] = value;
  store.set(key, value);
  if (data.ready && data.range) {
    deriveRange(data.range, thresholds(), lunWindow(S.focus));
    inspect(S.sel);
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
  const s = S.site;
  el('siteBtn').textContent =
    `${s.name} · ${Math.abs(s.lat).toFixed(2)}°${s.lat >= 0 ? 'N' : 'S'} ${Math.abs(s.lon).toFixed(2)}°${s.lon >= 0 ? 'E' : 'W'}${s.elevation == null ? '' : ` · ${s.elevation} m`} ▾`;
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
  const selId = S.sel >= 0 && prev && prev.nights[S.sel] ? prev.nights[S.sel].id : null;
  data.ready = false;
  el('loading').hidden = false;
  const token = ++computeToken;
  computeRange(S.site, S.rangeShift, thresholds(), lunWindow(S.focus), Date.now(), {
    isCancelled: () => token !== computeToken,
    onProgress: (done, total) => {
      el('loadingBar').style.width = ((100 * done) / total).toFixed(0) + '%';
    },
  })
    .then((r) => {
      if (!r || token !== computeToken) return;
      data.range = r;
      data.ready = true;
      el('loading').hidden = true;
      const { spec, nights } = r;
      const last = nights[nights.length - 1];
      el('rangeLabel').textContent =
        `${MON3[spec.m - 1]} ${spec.y} – ${MON3[last.m - 1]} ${last.y}`;
      let i = selId ? nights.findIndex((n) => n.id === selId) : -1;
      if (i < 0) i = r.tonightIdx >= 0 ? r.tonightIdx : 0;
      if (!selId || nights[i].id !== selId) S.riverExpanded = false;
      S.sel = i;
      inspect(i);
      setView(S.view);
      const v = canvasView();
      if (v) {
        if (v === river) scroller.scrollTop = Math.max(0, river.ys[i] - 3 * river.heights().base);
        else v.scrollTo(i, true);
      }
      draw();
      window.dispatchEvent(new Event('npa-ready'));
    })
    .catch((err: unknown) => {
      if (token !== computeToken) return;
      console.error(err);
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
    inspect(S.sel);
    draw();
  }
}

export function boot(): void {
  readColors();
  siteLabel();
  initSiteClock();
  for (const x of el('focusSeg').children)
    x.setAttribute('aria-pressed', String(Number((x as HTMLElement).dataset.val) === S.focus));
  el<HTMLSelectElement>('moonAltSel').value = String(S.moonAlt);
  el<HTMLSelectElement>('crescentSel').value = String(S.crescent);
  for (const b of el('viewSeg').children)
    b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.view === S.view));
  initGuide();
  exposeTestHooks();
  restart();
}

export interface TestHooks {
  S: typeof S;
  select: typeof select;
  setView: typeof setView;
  setOpt: typeof setOpt;
  toggleRiverNight: typeof toggleRiverNight;
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
    setView,
    setOpt,
    toggleRiverNight,
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
