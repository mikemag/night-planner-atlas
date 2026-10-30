import { S } from '../app/state';
import { fmtClock, fmtDur, MON3, MONL } from '../model/format';
import type { Month, NightRange } from '../model/range';
import { MS_H } from '../model/time';
import { el } from './dom';

export interface CalendarHeading {
  mo: Month;
  y: number;
  h: number;
  x?: number;
  w?: number;
}
let previousRange: NightRange | null = null;
let signature = '';

export const durationScale = (r: NightRange) => Math.max(2, Math.ceil(r.maxMF / MS_H / 2) * 2);

function phases(r: NightRange, mo: Month): string {
  return r.quarters
    .filter((q) => q.q === 0 || q.q === 2)
    .flatMap((q) => {
      const p = r.tz.wallParts(q.t + 30_000);
      return p.y === mo.y && p.m === mo.m
        ? [`${q.q === 0 ? 'New' : 'Full'} ${MON3[p.m - 1]} ${p.d}`]
        : [];
    })
    .join(' · ');
}

function profile(r: NightRange, mo: Month, width: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const max = durationScale(r),
    left = 30,
    bottom = 48,
    height = 32;
  const bw = (width - left - 5) / mo.idx.length;
  svg.setAttribute('viewBox', `0 0 ${width} 72`);
  svg.setAttribute('class', 'calendar-profile');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `Usable hours per evening date in ${MONL[mo.m - 1]} ${mo.y}. Scale 0 to ${max} hours, shared across months. Solid bars and amber marks are Friday and Saturday nights.`,
  );
  const node = (
    tag: 'text' | 'rect' | 'line',
    attrs: Record<string, string | number>,
    value = '',
  ) => {
    const n = document.createElementNS(ns, tag);
    for (const [key, val] of Object.entries(attrs)) n.setAttribute(key, String(val));
    n.textContent = value;
    svg.appendChild(n);
    return n;
  };
  node('text', { x: 0, y: 10 }, `${max}h`);
  node('text', { x: 6, y: bottom + 3 }, '0h');
  node('text', { x: left, y: 10 }, 'Usable hours · Fri/Sat solid');
  node('line', { x1: left, y1: bottom, x2: width, y2: bottom, class: 'profile-axis' });
  mo.idx.forEach((i, k) => {
    const n = r.nights[i],
      x = left + k * bw,
      h = (height * n.mfMs) / (max * MS_H);
    const weekend = n.dow === 5 || n.dow === 6;
    if (weekend)
      node('rect', {
        x: x + 0.5,
        y: bottom + 2,
        width: Math.max(1, bw - 1),
        height: 4,
        class: 'profile-weekend',
      });
    const bar = node('rect', {
      x: x + 0.5,
      y: bottom - h,
      width: Math.max(1, bw - 1.5),
      height: h,
      class: 'profile-bar',
      opacity: weekend ? 1 : 0.45,
    });
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${MON3[n.m - 1]} ${n.d}: ${fmtDur(n.mfMs)} usable dark`;
    bar.appendChild(title);
    if (n.d === 1 || n.d % 7 === 0 || k === mo.idx.length - 1)
      node('text', { x: x + bw / 2, y: 67, 'text-anchor': 'middle' }, String(n.d));
  });
  return svg;
}

/** Real headings wrap on phones; totals always refer to the named month, regardless of focus. */
export function prepareCalendarHeaders(
  r: NightRange,
  headings: CalendarHeading[],
  width: number,
): void {
  const year = S.calZoom === 'year';
  const key = JSON.stringify([
    year,
    width,
    S.site.tz,
    r.maxMF,
    r.months.map((m) => [m.key, m.total, m.good]),
  ]);
  if (previousRange === r && signature === key) return;
  previousRange = r;
  signature = key;
  const nodes = headings.map(({ mo }) => {
    const box = document.createElement('header');
    box.className = `calendar-heading${year ? ' year-heading' : ''}`;
    box.dataset.month = mo.key;
    box.dataset.first = String(mo.idx[0]);
    box.dataset.last = String(mo.idx.at(-1));
    const phase = phases(r, mo);
    if (year) {
      const button = document.createElement('button');
      button.className = 'calendar-month-link';
      button.dataset.calendarMonth = mo.key;
      const title = document.createElement('strong');
      title.textContent = `${MONL[mo.m - 1]} ${mo.y}`;
      const summary = document.createElement('span');
      summary.textContent = `${Math.round(mo.total / MS_H)}h usable · ${mo.good} nights ≥ 4h`;
      const dates = document.createElement('span');
      dates.textContent = phase;
      button.setAttribute(
        'aria-label',
        `${title.textContent}. ${fmtDur(mo.total)} usable dark; ${mo.good} nights with at least four hours. ${phase}. Open month.`,
      );
      button.append(title, summary, dates);
      box.append(button);
      return box;
    }
    const info = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = `${MONL[mo.m - 1]} ${mo.y}`;
    const total = document.createElement('details');
    total.className = 'calendar-month-total';
    const summary = document.createElement('summary');
    const number = document.createElement('strong');
    number.textContent = `${fmtDur(mo.total)} usable`;
    summary.append(number, ` · ${mo.good} nights ≥ 4h`);
    const explanation = document.createElement('p');
    explanation.textContent = `Sum of usable dark for the ${mo.idx.length} evening dates in ${MONL[mo.m - 1]} ${mo.y}. Planning thresholds apply; separate windows are added together. Neighboring-month dates are shown for week context and are excluded. New-moon focus emphasizes dates without changing this monthly total.`;
    summary.title = explanation.textContent;
    total.append(summary, explanation);
    const phaseText = document.createElement('p');
    phaseText.textContent = phase;
    phaseText.title = r.quarters
      .filter((q) => q.q === 0 || q.q === 2)
      .flatMap((q) => {
        const p = r.tz.wallParts(q.t + 30_000);
        return p.y === mo.y && p.m === mo.m
          ? [
              `${q.q === 0 ? 'New' : 'Full'} moon ${MON3[p.m - 1]} ${p.d}, ${fmtClock(p.h + p.mi / 60 - 12)} ${S.site.tz}`,
            ]
          : [];
      })
      .join(' · ');
    const context = document.createElement('p');
    context.textContent = 'Muted dates: neighboring months · — outside loaded range';
    info.append(title, total, phaseText, context);
    const graphWidth =
      width < 650 ? Math.max(200, width - 20) : Math.max(240, (width - 24 - 20) * 0.38);
    box.append(info, profile(r, mo, graphWidth));
    return box;
  });
  el('calendarHeaders').replaceChildren(...nodes);
}

export function placeCalendarHeaders(
  headings: CalendarHeading[],
  scrollTop: number,
  width: number,
  axis: number,
): void {
  for (const [k, node] of [...el('calendarHeaders').children].entries()) {
    const box = node as HTMLElement,
      b = headings[k];
    const top = axis + b.y;
    box.style.top = `${top}px`;
    box.style.left = `${b.x ?? 0}px`;
    box.style.width = `${b.w ?? width}px`;
    box.style.height = `${b.h}px`;
    box.style.clipPath =
      top < scrollTop + axis ? `inset(${scrollTop + axis - top}px 0 -400px 0)` : '';
    if (top + b.h <= scrollTop + axis)
      for (const total of box.querySelectorAll<HTMLDetailsElement>('details[open]'))
        total.open = false;
  }
}
