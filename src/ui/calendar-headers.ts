import { S } from '../app/state';
import { fmtDur, MONL } from '../model/format';
import type { NightRange } from '../model/range';
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
      name.textContent = MONL[mo.m - 1];
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
