import { atlas } from '../app/state';
import { moonAltAt, phaseAt, windowsText } from '../model/describe';
import { fmtClock, fmtDur, nightTitle } from '../model/format';
import { wallH } from '../model/night';
import { el } from './dom';

const tip = el('tip');

/** Tooltip for night `i`, with the sky at `hh` when the pointer is on a time axis. */
export function showTip(i: number, hh: number | null | undefined, px: number, py: number): void {
  const n = atlas().nights[i];
  tip.textContent = '';
  const add = (cls: string, s: string) => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = s;
    tip.appendChild(d);
    return d;
  };
  add('t1', nightTitle(n));
  add(
    't2',
    n.mfMs ? `${fmtDur(n.mfMs)} moon-free` : n.tdMs ? 'No moon-free true dark' : 'No true dark',
  );
  add('t3', windowsText(n));
  add('t3', `Sunset ${fmtClock(n.evH.sunset)} · Sunrise ${fmtClock(n.evH.sunrise)}`);
  add(
    't3',
    `Moon ${Math.round(n.illum * 100)}% · rise ${n.moonRise != null ? fmtClock(wallH(n.moonRise, n)) : '—'} · set ${n.moonSet != null ? fmtClock(wallH(n.moonSet, n)) : '—'}`,
  );
  if (hh != null) {
    const alt = moonAltAt(n, hh);
    const moon = alt == null ? '' : alt > 0 ? ` · moon up ${Math.round(alt)}°` : ' · moon down';
    add('t4', `At ${fmtClock(hh)}: ${phaseAt(n, hh)}${moon}`);
  }
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = px + 16,
    y = py + 14;
  if (x + r.width > window.innerWidth - 8) x = px - r.width - 16;
  if (y + r.height > window.innerHeight - 8) y = py - r.height - 12;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}

/** A one-line tooltip. */
export function showNote(msg: string, px: number, py: number): void {
  tip.textContent = msg;
  tip.hidden = false;
  tip.style.left = px + 14 + 'px';
  tip.style.top = py + 12 + 'px';
}

export function hideTip(): void {
  tip.hidden = true;
}
