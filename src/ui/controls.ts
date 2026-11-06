import type { ViewId } from '../app/settings';
import {
  canvasView,
  draw,
  goTonight,
  onTheme,
  resize,
  select,
  setFocus,
  setThreshold,
  setView,
  shiftRange,
  toggleRiverNight,
  toggleLunationsNight,
  toggleCalendarNight,
  openCalendarMonth,
} from '../app/shell';
import { S, data } from '../app/state';
import { prepareTimeZones } from '../app/timezones';
import { cv, size } from '../render/surface';
import { river } from '../views/river';
import { lunations } from '../views/lunations';
import { el, scroller } from './dom';
import { initSiteEditor } from './site-editor';
import { initRiverMinimap } from './river-minimap';
import { initBrowserData } from './browser-data';
import { initAppMenu } from './app-menu';
import { initChartLegend } from './chart-legend';
import { closeDocs, docsOpen } from './guide';

const VIEW_KEYS: ViewId[] = ['river', 'lunations', 'calendar', 'notes', 'weekends'];

/** Wire every control, pointer and keyboard event to the shell. */
export function initControls(): void {
  initCanvasPointer();
  initKeyboard();
  initHeader();
  initChartLegend();
  initSiteEditor();
  initBrowserData();
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
      draw();
    },
    { passive: true },
  );
}

function initCanvasPointer(): void {
  let dragMini = false;
  let tap: {
    x: number;
    y: number;
    i: number;
    id: number;
    scroll: number;
    left: number;
    week?: string;
    month?: string;
  } | null = null;
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
    if (e.pointerType === 'touch') return;
    const h = v.hit(px, py);
    S.riverReadoutSelected = false;
    S.hover = h && !h.mini ? h : null;
    cv.style.cursor = h && (h.i != null || h.month || h.mini) ? 'pointer' : 'default';
    if (v === river && h?.mini) cv.style.cursor = river.miniContains(px, py) ? 'grab' : 'pointer';
    draw();
  });
  cv.addEventListener('pointerleave', (e) => {
    S.hover = null;
    if (e.pointerType !== 'touch') S.riverReadoutSelected = false;
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
      cv.setPointerCapture(e.pointerId);
      river.beginMiniDrag(e.clientX - r.left, e.clientY - r.top);
      cv.style.cursor = 'grabbing';
      draw();
      return;
    }
    if (h.i != null || h.month) {
      tap = {
        x: e.clientX,
        y: e.clientY,
        i: h.i ?? -1,
        id: e.pointerId,
        scroll: scroller.scrollTop,
        left: scroller.scrollLeft,
        week: h.week,
        month: h.month,
      };
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
      if (S.view === 'calendar') {
        if (S.calZoom === 'year' && pending.month) openCalendarMonth(pending.month, pending.i);
        else toggleCalendarNight(pending.i, pending.week);
      } else if (S.view === 'lunations') toggleLunationsNight(pending.i);
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
}

function initKeyboard(): void {
  const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (docsOpen()) {
      if (
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !document.querySelector('.dropdown-menu.show') &&
        /^[1235]$/.test(e.key)
      ) {
        closeDocs();
        setView(VIEW_KEYS[+e.key - 1]);
      }
      return;
    }
    if (
      e.defaultPrevented ||
      document.querySelector('.modal.show, .dropdown-menu.show') ||
      target?.closest('.modal, .dropdown-menu') ||
      target?.closest('#riverMinimap') ||
      (e.key !== 'Escape' && target?.closest('#calendarHeaders')) ||
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
      (S.view === 'calendar' ||
        S.view === 'lunations' ||
        (S.view === 'river' && S.riverZoom === 'month')) &&
      (target === cv || target === document.body)
    ) {
      e.preventDefault();
      if (S.view === 'calendar') {
        if (S.calZoom === 'year') {
          const n = data.range.nights[S.sel];
          if (n) openCalendarMonth(`${n.y}-${String(n.m).padStart(2, '0')}`, S.sel);
        } else toggleCalendarNight();
      } else if (S.view === 'lunations') toggleLunationsNight();
      else toggleRiverNight();
      return;
    }
    const step = steps[e.key];
    if (step && canvasView()) {
      e.preventDefault();
      if (target?.closest('#riverDetail, #lunationsDetail, #calendarDetail'))
        cv.focus({ preventScroll: true });
      const { nights, tonightIdx } = data.range;
      select(
        S.view === 'lunations'
          ? lunations.navigate(e.key)
          : Math.max(0, Math.min(nights.length - 1, (S.sel < 0 ? tonightIdx : S.sel) + step)),
        true,
      );
    } else if (e.key === 't' || e.key === 'T') {
      goTonight();
    } else if (/^[1-5]$/.test(e.key)) {
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
      if (S.view === 'calendar' && S.calendarExpanded) {
        if (target?.closest('#calendarDetail')) cv.focus({ preventScroll: true });
        toggleCalendarNight();
      }
    }
  });
}

function initHeader(): void {
  initAppMenu();
  el('viewSeg').addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button');
    if (b?.dataset.view) setView(b.dataset.view as ViewId);
  });
  const moonSettings = el<HTMLDetailsElement>('moonSettings');
  const phone = window.matchMedia('(max-width: 700px)');
  const layoutMoonSettings = () => {
    const summary = el('moonSettingsSummary');
    const focused = moonSettings.contains(document.activeElement);
    // Keep keyboard focus on a visible control when crossing the phone breakpoint.
    if (phone.matches) {
      summary.hidden = false;
      if (focused) summary.focus({ preventScroll: true });
      moonSettings.open = false;
    } else {
      moonSettings.open = true;
      if (focused) el('moonAltSel').focus({ preventScroll: true });
      summary.hidden = true;
    }
  };
  layoutMoonSettings();
  phone.addEventListener('change', layoutMoonSettings);
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
  el('todayBtn').addEventListener('click', goTonight);
  el('rangePrev').addEventListener('click', () => shiftRange(-1));
  el('rangeNext').addEventListener('click', () => shiftRange(1));
  el('lunationsHeaders').addEventListener('click', (e) => {
    const pick = (e.target as Element).closest<HTMLElement>('button[data-weekend]');
    if (!pick) return;
    cv.focus({ preventScroll: true });
    const i = Number(pick.dataset.weekend);
    if (S.lunationsExpanded && S.sel === i) select(i, true);
    else toggleLunationsNight(i);
  });
  el('calendarHeaders').addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button[data-calendar-month]');
    if (b) openCalendarMonth(b.dataset.calendarMonth!);
  });
  el('calendarDetail').addEventListener('click', (e) => {
    if (!(e.target as Element).closest('#calendarCollapse')) return;
    cv.focus({ preventScroll: true });
    toggleCalendarNight();
  });
  el('lunationsDetail').addEventListener('click', (e) => {
    if (!(e.target as Element).closest('#lunationsCollapse')) return;
    cv.focus({ preventScroll: true });
    toggleLunationsNight();
  });
}
