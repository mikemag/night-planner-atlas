import { DEFAULT_SITE, type ViewId } from '../app/settings';
import {
  applySite,
  canvasView,
  draw,
  goTonight,
  onTheme,
  relayout,
  resize,
  select,
  setFocus,
  setOpt,
  setThreshold,
  setView,
  shiftRange,
  stepMonth,
  toggleRiverNight,
} from '../app/shell';
import { S, data } from '../app/state';
import { cv } from '../render/surface';
import { calendar } from '../views/calendar';
import { river } from '../views/river';
import { el, scroller } from './dom';
import { hideTip, showNote, showTip } from './tooltip';

const VIEW_KEYS: ViewId[] = ['calendar', 'river', 'lunations', 'notes'];

/** Wire every control, pointer and keyboard event to the shell. */
export function initControls(): void {
  initCanvasPointer();
  initKeyboard();
  initHeader();
  initSiteEditor();
  // theme changes re-read tokens; size changes re-lay out; scrolling repaints
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
  } catch {
    /* old engines */
  }
  new MutationObserver(onTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class'],
  });
  new ResizeObserver(() => {
    if (canvasView()) resize();
  }).observe(scroller);
  scroller.addEventListener(
    'scroll',
    () => {
      S.hover = null;
      hideTip();
      draw();
    },
    { passive: true },
  );
}

function initCanvasPointer(): void {
  let dragMini = false;
  let tap: { x: number; y: number; i: number; id: number; scroll: number } | null = null;
  cv.addEventListener('pointermove', (e) => {
    const v = canvasView();
    if (!data.ready || !v) return;
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left,
      py = e.clientY - r.top;
    if (dragMini && v === river) {
      river.dragMinimap(py);
      return;
    }
    if (v === river && e.pointerType === 'touch') return;
    const h = v.hit(px, py);
    const prev = S.hover;
    S.riverReadoutSelected = false;
    S.hover = h && !h.mini ? h : null;
    cv.style.cursor = h && (h.i != null || h.gutter || h.mini) ? 'pointer' : 'default';
    if (v === river && h?.mini) cv.style.cursor = river.miniContains(px, py) ? 'grab' : 'pointer';
    if (v === river) hideTip();
    else if (h && h.i != null) showTip(h.i, h.hh, e.clientX, e.clientY);
    else if (h && h.gutter)
      showNote(
        S.expandedWeek === h.gutter
          ? 'Collapse this week'
          : 'Expand this week for times and moonrise/moonset',
        e.clientX,
        e.clientY,
      );
    else hideTip();
    if (v === river || JSON.stringify(prev) !== JSON.stringify(S.hover)) draw();
  });
  cv.addEventListener('pointerleave', (e) => {
    S.hover = null;
    if (e.pointerType !== 'touch') S.riverReadoutSelected = false;
    hideTip();
    draw();
  });
  cv.addEventListener('pointerdown', (e) => {
    const v = canvasView();
    if (!data.ready || !v || e.button !== 0) return;
    const r = cv.getBoundingClientRect();
    const h = v.hit(e.clientX - r.left, e.clientY - r.top);
    if (!h) return;
    if (h.mini) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragMini = true;
      S.hover = null;
      S.riverReadoutSelected = false;
      hideTip();
      cv.setPointerCapture(e.pointerId);
      river.beginMiniDrag(e.clientX - r.left, e.clientY - r.top);
      cv.style.cursor = 'grabbing';
      draw();
      return;
    }
    if (h.gutter) {
      S.expandedWeek = S.expandedWeek === h.gutter ? null : h.gutter;
      relayout();
      return;
    }
    if (h.i != null) {
      if (v === river)
        tap = { x: e.clientX, y: e.clientY, i: h.i, id: e.pointerId, scroll: scroller.scrollTop };
      else select(h.i, false);
    }
  });
  const endMiniDrag = () => {
    dragMini = false;
    river.endMiniDrag();
    cv.style.cursor = 'default';
  };
  cv.addEventListener('pointerup', (e) => {
    const pending = tap;
    tap = null;
    if (
      !dragMini &&
      pending &&
      e.pointerId === pending.id &&
      Math.hypot(e.clientX - pending.x, e.clientY - pending.y) <= 8 &&
      Math.abs(scroller.scrollTop - pending.scroll) <= 3
    ) {
      cv.focus({ preventScroll: true });
      if (S.riverZoom === 'month') toggleRiverNight(pending.i);
      else select(pending.i, false);
    }
    endMiniDrag();
  });
  cv.addEventListener('pointercancel', () => {
    tap = null;
    endMiniDrag();
  });
  cv.addEventListener('lostpointercapture', endMiniDrag);
  cv.addEventListener('dblclick', (e) => {
    if (S.view !== 'calendar' || S.calZoom !== 'year') return;
    const r = cv.getBoundingClientRect();
    const h = calendar.hit(e.clientX - r.left, e.clientY - r.top);
    if (h && h.i != null) {
      setOpt('calZoom', 'month');
      select(h.i, true, true);
    }
  });
}

function initKeyboard(): void {
  const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (
      !data.ready ||
      !data.range ||
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      target?.isContentEditable ||
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName ?? '')
    )
      return;
    if (
      (e.key === 'Enter' || e.key === ' ') &&
      S.view === 'river' &&
      S.riverZoom === 'month' &&
      (target === cv || target === document.body)
    ) {
      e.preventDefault();
      toggleRiverNight();
      return;
    }
    const step = steps[e.key];
    if (step && canvasView()) {
      e.preventDefault();
      if (target?.closest('#riverDetail')) cv.focus({ preventScroll: true });
      const { nights, tonightIdx } = data.range;
      select(
        Math.max(0, Math.min(nights.length - 1, (S.sel < 0 ? tonightIdx : S.sel) + step)),
        true,
      );
    } else if (e.key === 't' || e.key === 'T') {
      goTonight();
    } else if (e.key >= '1' && e.key <= '4') {
      setView(VIEW_KEYS[+e.key - 1]);
    } else if (e.key === 'Escape') {
      if (S.view === 'river' && S.riverZoom === 'month' && S.riverExpanded) {
        if (target?.closest('#riverDetail')) cv.focus({ preventScroll: true });
        toggleRiverNight();
      }
      S.expandedWeek = null;
      relayout();
    }
  });
}

function initHeader(): void {
  el('viewSeg').addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button');
    if (b?.dataset.view) setView(b.dataset.view as ViewId);
  });
  el('focusSeg').addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button');
    if (b) setFocus(Number(b.dataset.val));
  });
  el<HTMLSelectElement>('moonAltSel').addEventListener('change', (e) =>
    setThreshold('moonAlt', Number((e.target as HTMLSelectElement).value)),
  );
  el<HTMLSelectElement>('crescentSel').addEventListener('change', (e) =>
    setThreshold('crescent', Number((e.target as HTMLSelectElement).value)),
  );
  el('prevBtn').addEventListener('click', () => stepMonth(-1));
  el('nextBtn').addEventListener('click', () => stepMonth(1));
  el('todayBtn').addEventListener('click', goTonight);
  el('insPrev').addEventListener('click', () => select(Math.max(0, S.sel - 1), true));
  el('insNext').addEventListener('click', () => {
    const last = (data.range?.nights.length ?? 1) - 1;
    select(Math.min(last, S.sel + 1), true);
  });
  el('rangePrev').addEventListener('click', () => shiftRange(-1));
  el('rangeNext').addEventListener('click', () => shiftRange(1));
  el('insWeekends').addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button[data-i]');
    if (b) select(Number(b.dataset.i), true);
  });
}

function initSiteEditor(): void {
  const pop = el('sitePop');
  const name = el<HTMLInputElement>('siteName'),
    lat = el<HTMLInputElement>('siteLat'),
    lon = el<HTMLInputElement>('siteLon'),
    elevation = el<HTMLInputElement>('siteElevation'),
    tz = el<HTMLInputElement>('siteTz'),
    err = el('siteErr');
  el('siteBtn').addEventListener('click', () => {
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      name.value = S.site.name;
      lat.value = String(S.site.lat);
      lon.value = String(S.site.lon);
      elevation.value = S.site.elevation == null ? '' : String(S.site.elevation);
      tz.value = S.site.tz;
      err.hidden = true;
      name.focus();
    }
  });
  el('siteCancel').addEventListener('click', () => {
    pop.hidden = true;
  });
  el('siteReset').addEventListener('click', () => applySite({ ...DEFAULT_SITE }));
  el('siteApply').addEventListener('click', () => {
    const la = parseFloat(lat.value),
      lo = parseFloat(lon.value),
      zone = tz.value.trim(),
      elevationText = elevation.value.trim(),
      metres = elevationText === '' ? undefined : Number(elevationText);
    const fail = (msg: string) => {
      err.textContent = msg;
      err.hidden = false;
    };
    if (!(la >= -65 && la <= 65))
      return fail('Latitude must be between −65° and 65° for this planner.');
    if (!(lo >= -180 && lo <= 180)) return fail('Longitude must be between −180° and 180°.');
    if (
      elevation.validity.badInput ||
      (metres != null && (!Number.isFinite(metres) || metres < -500 || metres > 10000))
    )
      return fail(
        'Elevation must be between −500 and 10,000 metres above sea level, or left blank.',
      );
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
    } catch {
      return fail(`“${zone}” is not a time zone name. Try America/Los_Angeles.`);
    }
    applySite({
      name: name.value.trim() || 'Custom site',
      lat: la,
      lon: lo,
      tz: zone,
      ...(metres == null ? {} : { elevation: metres }),
    });
  });
}
