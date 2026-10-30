import type { ViewId } from '../app/settings';
import {
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
  toggleLunationsNight,
} from '../app/shell';
import { S, data } from '../app/state';
import { loadTheme, setTheme, type Theme } from '../app/theme';
import { prepareTimeZones } from '../app/timezones';
import { cv, size } from '../render/surface';
import { calendar } from '../views/calendar';
import { river } from '../views/river';
import { lunations } from '../views/lunations';
import { el, scroller } from './dom';
import { hideTip, showNote, showTip } from './tooltip';
import { initSiteEditor } from './site-editor';
import { initRiverMinimap } from './river-minimap';

const VIEW_KEYS: ViewId[] = ['calendar', 'river', 'lunations', 'notes'];

/** Wire every control, pointer and keyboard event to the shell. */
export function initControls(): void {
  initCanvasPointer();
  initKeyboard();
  initHeader();
  initSiteEditor();
  initRiverMinimap();
  void prepareTimeZones().catch(() => {
    /* Manual zone entry remains available. */
  });
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
  let resizeFrame = 0;
  new ResizeObserver(() => {
    // Resizing the canvas can affect scrollbars. Let layout settle outside observer delivery,
    // and skip notifications for dimensions already handled by a view change.
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (
        canvasView() &&
        (scroller.clientWidth !== size.W ||
          scroller.clientHeight !== size.H ||
          (window.devicePixelRatio || 1) !== size.dpr)
      )
        resize();
    });
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
  let tap: { x: number; y: number; i: number; id: number; scroll: number; left: number } | null =
    null;
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
    if ((v === river || v === lunations) && e.pointerType === 'touch') return;
    const h = v.hit(px, py);
    const prev = S.hover;
    S.riverReadoutSelected = false;
    S.hover = h && !h.mini ? h : null;
    cv.style.cursor = h && (h.i != null || h.gutter || h.mini) ? 'pointer' : 'default';
    if (v === river && h?.mini) cv.style.cursor = river.miniContains(px, py) ? 'grab' : 'pointer';
    if (v === river || v === lunations) hideTip();
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
    if (v === river || v === lunations || JSON.stringify(prev) !== JSON.stringify(S.hover)) draw();
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
      if (v === river || v === lunations)
        tap = {
          x: e.clientX,
          y: e.clientY,
          i: h.i,
          id: e.pointerId,
          scroll: scroller.scrollTop,
          left: scroller.scrollLeft,
        };
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
      Math.abs(scroller.scrollTop - pending.scroll) <= 3 &&
      Math.abs(scroller.scrollLeft - pending.left) <= 3
    ) {
      cv.focus({ preventScroll: true });
      if (S.view === 'lunations') toggleLunationsNight(pending.i);
      else if (S.riverZoom === 'month') toggleRiverNight(pending.i);
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
      document.querySelector('dialog[open]') ||
      target?.closest('#riverMinimap') ||
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
      (S.view === 'lunations' || (S.view === 'river' && S.riverZoom === 'month')) &&
      (target === cv || target === document.body)
    ) {
      e.preventDefault();
      if (S.view === 'lunations') toggleLunationsNight();
      else toggleRiverNight();
      return;
    }
    const step = steps[e.key];
    if (step && canvasView()) {
      e.preventDefault();
      if (target?.closest('#riverDetail, #lunationsDetail')) cv.focus({ preventScroll: true });
      const { nights, tonightIdx } = data.range;
      select(
        S.view === 'lunations'
          ? lunations.navigate(e.key)
          : Math.max(0, Math.min(nights.length - 1, (S.sel < 0 ? tonightIdx : S.sel) + step)),
        true,
      );
    } else if (e.key === 't' || e.key === 'T') {
      goTonight();
    } else if (e.key >= '1' && e.key <= '4') {
      setView(VIEW_KEYS[+e.key - 1]);
    } else if (e.key === 'Escape') {
      const total =
        S.view === 'lunations'
          ? document.querySelector<HTMLDetailsElement>('.lunation-total[open]')
          : null;
      if (total) {
        total.open = false;
        return;
      }
      if (S.view === 'lunations' && S.lunationsExpanded) {
        if (target?.closest('#lunationsDetail')) cv.focus({ preventScroll: true });
        toggleLunationsNight();
      }
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
  const theme = el<HTMLSelectElement>('themeSel');
  theme.value = loadTheme();
  theme.addEventListener('change', () => setTheme(theme.value as Theme));
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
  el('lunationsHeaders').addEventListener('click', (e) => {
    const pick = (e.target as Element).closest<HTMLElement>('button[data-weekend]');
    if (!pick) return;
    cv.focus({ preventScroll: true });
    const i = Number(pick.dataset.weekend);
    if (S.lunationsExpanded && S.sel === i) select(i, true);
    else toggleLunationsNight(i);
  });
  el('lunationsDetail').addEventListener('click', (e) => {
    if (!(e.target as Element).closest('#lunationsCollapse')) return;
    cv.focus({ preventScroll: true });
    toggleLunationsNight();
  });
}
