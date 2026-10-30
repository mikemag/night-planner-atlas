import type { Night } from '../model/night';
import { annotationChart, type DetailGeometry } from './night-detail';
import { el } from './dom';

const box = el('riverDetail');
let cachedNight: Night | null = null;
let cachedWindows: Night['mf'] | null = null;
let cachedGeometry = '';

/** Fixed semantic lanes keep nightly keyboard scrubbing stable at a compact, constant height. */
export function prepareRiverDetail(n: Night | null, g: DetailGeometry, narrow: boolean): number {
  box.hidden = !n;
  if (!n) return 0;
  box.style.width = `${g.width}px`;
  box.classList.toggle('narrow', narrow);
  const geometry = JSON.stringify(g);
  if (cachedNight !== n || cachedWindows !== n.mf || cachedGeometry !== geometry) {
    cachedNight = n;
    cachedWindows = n.mf;
    cachedGeometry = geometry;
    box.replaceChildren(annotationChart(n, g));
  }
  return box.getBoundingClientRect().height;
}

/** Clip the scrolling details beneath the pinned time axis; native scrolling stays in the chart. */
export function placeRiverDetail(top: number, scrollTop: number, axis: number): void {
  box.style.top = `${top}px`;
  box.style.clipPath = `inset(${Math.max(0, scrollTop + axis - top)}px 0 0 0)`;
}
