import { S } from '../app/state';
import { nightTitle } from '../model/format';
import type { Night } from '../model/night';
import { annotationChart, type DetailGeometry } from './river-detail';
import { el } from './dom';

export const LUNATION_DETAIL_HEADING = 44;
export const LUNATION_DETAIL_AXIS = 22;
export const LUNATION_DETAIL_BAND = 24;
export const LUNATION_DETAIL_HEIGHT =
  LUNATION_DETAIL_HEADING + LUNATION_DETAIL_AXIS + LUNATION_DETAIL_BAND + 179;

let previous = '';
let previousNight: Night | null = null;
let previousWindows: Night['mf'] | null = null;

/** The sky strip is painted on the shared canvas through the transparent timeline slot. */
export function prepareLunationsDetail(n: Night | null, g: DetailGeometry, outside: boolean): void {
  const box = el('lunationsDetail');
  box.hidden = !n;
  if (!n) return;
  const key = JSON.stringify([g, outside, S.site.tz]);
  if (previous === key && previousNight === n && previousWindows === n.mf) return;
  previous = key;
  previousNight = n;
  previousWindows = n.mf;
  const heading = document.createElement('header');
  heading.className = 'lunations-night-heading';
  const title = document.createElement('h3');
  title.textContent = nightTitle(n);
  const zone = document.createElement('p');
  zone.textContent = `${S.site.tz}${outside ? ' · Night outside displayed window' : ''}`;
  const name = document.createElement('div');
  name.append(title, zone);
  const close = document.createElement('button');
  close.className = 'icon-btn';
  close.id = 'lunationsCollapse';
  close.setAttribute('aria-label', 'Collapse night');
  close.textContent = '×';
  heading.append(name, close);
  const slot = document.createElement('div');
  slot.className = 'lunations-night-slot';
  slot.setAttribute('aria-hidden', 'true');
  box.replaceChildren(heading, slot, annotationChart(n, g));
}

export function placeLunationsDetail(
  top: number,
  scrollTop: number,
  left: number,
  width: number,
  axis: number,
): void {
  const box = el('lunationsDetail');
  box.style.top = `${top}px`;
  box.style.left = `${left}px`;
  box.style.width = `${width}px`;
  box.style.clipPath = `inset(${Math.max(0, scrollTop + axis - top)}px 0 0 0)`;
}
