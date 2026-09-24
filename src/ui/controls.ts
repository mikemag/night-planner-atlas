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
} from '../app/shell';
import { S, data } from '../app/state';
import { cv } from '../render/surface';
import { calendar } from '../views/calendar';
import { river } from '../views/river';
import { el, scroller } from './dom';
import { hideTip, showNote, showTip } from './tooltip';

const VIEW_KEYS: ViewId[] = ['calendar', 'river', 'lunations', 'table', 'notes'];

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
  scroller.addEventListener('scroll', draw, { passive: true });
}

function initCanvasPointer(): void {
  let dragMini = false;
  cv.addEventListener('pointermove', (e) => {
    const v = canvasView();
    if (!data.ready || !v) return;
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left,
      py = e.clientY - r.top;
    if (dragMini && v === river) {
      river.miniScroll(py);
      return;
    }
    const h = v.hit(px, py);
    const prev = S.hover;
    S.hover = h && !h.mini ? h : null;
    cv.style.cursor = h && (h.i != null || h.gutter || h.mini) ? 'pointer' : 'default';
    if (h && h.i != null) showTip(h.i, h.hh, e.clientX, e.clientY);
    else if (h && h.gutter)
      showNote(
        S.expandedWeek === h.gutter
          ? 'Collapse this week'
          : 'Expand this week for times and moonrise/moonset',
        e.clientX,
        e.clientY,
      );
    else hideTip();
    if (JSON.stringify(prev) !== JSON.stringify(S.hover)) draw();
  });
  cv.addEventListener('pointerleave', () => {
    S.hover = null;
    hideTip();
    draw();
  });
  cv.addEventListener('pointerdown', (e) => {
    const v = canvasView();
    if (!data.ready || !v) return;
    const r = cv.getBoundingClientRect();
    const h = v.hit(e.clientX - r.left, e.clientY - r.top);
    if (!h) return;
    if (h.mini) {
      dragMini = true;
      cv.setPointerCapture(e.pointerId);
      river.miniScroll(e.clientY - r.top);
      return;
    }
    if (h.gutter) {
      S.expandedWeek = S.expandedWeek === h.gutter ? null : h.gutter;
      relayout();
      return;
    }
    if (h.i != null) select(h.i, false);
  });
  cv.addEventListener('pointerup', () => {
    dragMini = false;
  });
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
    if (!data.ready || !data.range || target?.tagName === 'INPUT' || target?.tagName === 'SELECT')
      return;
    const step = steps[e.key];
    if (step && canvasView()) {
      e.preventDefault();
      const { nights, tonightIdx } = data.range;
      select(
        Math.max(0, Math.min(nights.length - 1, (S.sel < 0 ? tonightIdx : S.sel) + step)),
        true,
      );
    } else if (e.key === 't' || e.key === 'T') {
      goTonight();
    } else if (e.key >= '1' && e.key <= '5') {
      setView(VIEW_KEYS[+e.key - 1]);
    } else if (e.key === 'Escape') {
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
  el('tableView').addEventListener('click', (e) => {
    const tr = (e.target as Element).closest<HTMLElement>('tr[data-i]');
    if (tr) select(Number(tr.dataset.i), false);
  });
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
    tz = el<HTMLInputElement>('siteTz'),
    err = el('siteErr');
  el('siteBtn').addEventListener('click', () => {
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      name.value = S.site.name;
      lat.value = String(S.site.lat);
      lon.value = String(S.site.lon);
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
      zone = tz.value.trim();
    const fail = (msg: string) => {
      err.textContent = msg;
      err.hidden = false;
    };
    if (!(la >= -65 && la <= 65))
      return fail('Latitude must be between −65° and 65° for this planner.');
    if (!(lo >= -180 && lo <= 180)) return fail('Longitude must be between −180° and 180°.');
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
    } catch {
      return fail(`“${zone}” is not a time zone name. Try America/Los_Angeles.`);
    }
    applySite({ name: name.value.trim() || 'Custom site', lat: la, lon: lo, tz: zone });
  });
}
