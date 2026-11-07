import { S } from '../app/state';
import { fmtDur, MON3, MONL } from '../model/format';
import { CALENDAR_MONTHS, type NightRange } from '../model/range';
import { MS_H } from '../model/time';
import type { CalendarMonthBlock } from '../views/calendar';
import { el } from './dom';

let previousRange: NightRange | null = null;
let signature = '';

/** A whole mini-calendar is a native month button, including in the compact phone Year. */
export function prepareCalendarHeaders(
  r: NightRange,
  blocks: CalendarMonthBlock[],
  width: number,
  compact: boolean,
): void {
  el('calendarHeaders').classList.toggle('calendar-compact-year', compact);
  const key = JSON.stringify([
    width,
    compact,
    blocks.map((b) => [b.mo.key, b.mo.total, b.x, b.y, b.w, b.h]),
  ]);
  if (previousRange === r && signature === key) return;
  previousRange = r;
  signature = key;
  el('calendarHeaders').replaceChildren(
    ...blocks.map(({ mo }) => {
      const box = document.createElement('button');
      box.className = 'calendar-month-link';
      box.dataset.calendarMonth = mo.key;
      const events = r.quarters
        .filter((q) => q.q === 0)
        .flatMap((q) => {
          const p = r.tz.wallParts(q.t + 30_000);
          return p.y === mo.y && p.m === mo.m ? [p.d] : [];
        });
      const name = document.createElement('strong');
      name.textContent = (width < 360 ? MON3 : MONL)[mo.m - 1];
      if (r.spec.count !== CALENDAR_MONTHS) {
        const year = document.createElement('small');
        year.className = 'calendar-year-label';
        year.textContent = String(mo.y);
        name.append(' ', year);
      }
      const total = document.createElement('span');
      total.className = 'calendar-year-total';
      total.textContent = `${Math.round(mo.total / MS_H)}h`;
      const phases = document.createElement('span');
      phases.className = 'calendar-year-phases';
      phases.textContent = events.length
        ? `New moon ${events.join(', ')}`
        : 'No new moon this month';
      box.setAttribute(
        'aria-label',
        `${MONL[mo.m - 1]} ${mo.y}. ${fmtDur(mo.total)} usable dark. ${phases.textContent}. Open month.`,
      );
      box.append(name, total, phases);
      return box;
    }),
  );
}

export function placeCalendarHeaders(blocks: CalendarMonthBlock[]): void {
  for (const [k, node] of [...el('calendarHeaders').children].entries()) {
    const box = node as HTMLElement,
      b = blocks[k];
    box.style.top = `${b.y}px`;
    box.style.left = `${b.x}px`;
    box.style.width = `${b.w}px`;
    box.style.height = `${b.h}px`;
    box.setAttribute('aria-current', String(b.mo.idx.includes(S.sel)));
  }
}

export interface CalendarPeriodHeading {
  key: string;
  title: string;
  context: string;
  y: number;
  h: number;
}

/** Period titles scroll with the dates; the chart header retains the browsed period label. */
export function prepareCalendarPeriods(
  r: NightRange,
  headings: CalendarPeriodHeading[],
  width: number,
): void {
  const root = el('calendarHeaders');
  root.classList.remove('calendar-compact-year');
  const key = JSON.stringify(['periods', width, headings]);
  if (previousRange !== r || signature !== key) {
    previousRange = r;
    signature = key;
    root.replaceChildren(
      ...headings.map((h) => {
        const box = document.createElement('header');
        box.className = 'calendar-period-heading';
        box.dataset.period = h.key;
        const title = document.createElement('h2');
        title.textContent = h.title;
        const context = document.createElement('span');
        context.textContent = h.context;
        box.append(title, context);
        return box;
      }),
    );
  }
  [...root.children].forEach((node, i) => {
    const box = node as HTMLElement,
      h = headings[i];
    box.style.top = `${h.y}px`;
    box.style.left = '0';
    box.style.width = `${width}px`;
    box.style.height = `${h.h}px`;
  });
}
