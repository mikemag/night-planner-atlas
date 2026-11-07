import { MON3, WD3, fmtClock, fmtDur } from '../model/format';
import { FULL_CYCLE, lunationWindow, visibleLunations, type NightRange } from '../model/range';
import { el } from './dom';

let signature = '';

/** Real headings, total explanations and weekend buttons remain usable without hover. */
export function prepareLunationsHeaders(r: NightRange, N: number): void {
  const cycles = visibleLunations(r, N);
  const key = JSON.stringify([N, cycles, r.site.tz, r.nights[0].id, r.nights.at(-1)!.id]);
  if (key === signature) return;
  signature = key;
  const headers = cycles.map((L, k) => {
    const header = document.createElement('header');
    header.className = 'lunation-heading';
    header.dataset.cycle = String(k);
    const p = r.tz.wallParts(L.t + 30_000);
    const window = lunationWindow(L, N);
    const firstIndex = Math.max(0, window.first),
      lastIndex = Math.min(r.nights.length - 1, window.last);
    const first = r.nights[firstIndex];
    const last = r.nights[lastIndex];
    const count = lastIndex - firstIndex + 1;
    header.dataset.first = String(firstIndex);
    header.dataset.last = String(lastIndex);
    const range = `${MON3[first.m - 1]} ${first.d}${first.y !== last.y ? ', ' + first.y : ''} – ${MON3[last.m - 1]} ${last.d}, ${last.y}`;
    const partial = firstIndex !== window.first || lastIndex !== window.last;
    const name = document.createElement('div');
    name.className = 'lunation-name';
    const title = document.createElement('h2');
    title.textContent = `New moon · ${MON3[p.m - 1]} ${p.d}, ${p.y}`;
    const time = document.createElement('p');
    const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
    time.textContent = `${WD3[dow]} ${fmtClock(p.h + p.mi / 60 - 12)} · ${range}${partial ? ' · Partial' : ''}`;
    time.title = `New moon at the site's local time. Displayed evening dates: ${range}.`;
    name.append(title, time);
    const total = document.createElement('details');
    total.className = 'lunation-total';
    const summary = document.createElement('summary');
    const duration = document.createElement('strong');
    duration.textContent = fmtDur(L.total);
    const caption = document.createElement('span');
    caption.textContent = N >= FULL_CYCLE ? 'usable dark · full cycle' : `usable dark in ±${N}`;
    summary.append(duration, caption);
    const explanation = document.createElement('p');
    explanation.textContent = `${fmtDur(L.total)} is the sum of usable dark across the ${count} displayed evening dates: ${range}. Planning thresholds apply. Separate windows and nights are added together.${N >= FULL_CYCLE ? ' Each night belongs to the new moon nearest its site-local midnight; cycles do not overlap. Empty edge positions are outside this cycle.' : ''}${partial ? ` Partial range: ${count} of ${window.last - window.first + 1} nights are loaded.` : ''}`;
    summary.title = explanation.textContent;
    total.append(summary, explanation);
    const pick = document.createElement(L.best ? 'button' : 'span');
    pick.className = 'lunation-pick';
    if (L.best) {
      const a = r.nights[L.best.i],
        b = r.nights[L.best.i + 1];
      pick.dataset.weekend = String(L.best.i);
      pick.textContent = `Best Fri–Sat · ${MON3[a.m - 1]} ${a.d}–${a.m !== b.m ? MON3[b.m - 1] + ' ' : ''}${b.d} · ${fmtDur(L.best.sum)}`;
      pick.setAttribute('aria-label', `${pick.textContent}. Expand Friday night.`);
    } else pick.textContent = 'No Fri–Sat pair in this window';
    header.append(name, total, pick);
    return header;
  });
  el('lunationsHeaders').replaceChildren(...headers);
}

export function placeLunationsHeaders(
  tops: number[],
  height: number,
  scrollTop: number,
  left: number,
  width: number,
  axis: number,
): void {
  for (const [k, header] of [...el('lunationsHeaders').children].entries()) {
    const box = header as HTMLElement;
    const top = tops[k] + axis;
    box.style.top = `${top}px`;
    box.style.left = `${left}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    box.style.visibility = top + height <= scrollTop + axis ? 'hidden' : '';
    box.style.clipPath = top < scrollTop + axis ? `inset(${scrollTop + axis - top}px 0 0 0)` : '';
  }
}
