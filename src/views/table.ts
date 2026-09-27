import { S, atlas } from '../app/state';
import { MON3, MONL, WD3, fmtClock, fmtClockS, fmtDur } from '../model/format';
import { wallH } from '../model/night';
import { el } from '../ui/dom';

/** The numbers behind the charts for month `k`, one row per night. */
export function renderTable(k: number): void {
  const { nights, months } = atlas();
  const mo = months[k];
  const rows = mo.idx
    .map((i) => {
      const n = nights[i],
        E = n.evH;
      const wk = n.dow === 5 || n.dow === 6;
      return `<tr data-i="${i}" class="${wk ? 'wk' : ''} ${i === S.sel ? 'sel' : ''}"><td>${WD3[n.dow]} ${MON3[n.m - 1]} ${n.d}</td><td>${fmtClock(E.sunset)}</td><td>${fmtClock(E.astroDusk)}</td><td>${fmtClock(E.astroDawn)}</td><td>${fmtClock(E.sunrise)}</td><td>${Math.round(n.illum * 100)}%</td><td>${n.moonRise != null ? fmtClock(wallH(n.moonRise, n)) : '—'}</td><td>${n.moonSet != null ? fmtClock(wallH(n.moonSet, n)) : '—'}</td><td>${n.tdMs ? fmtDur(n.tdMs) : '—'}</td><td class="mf">${n.mfMs ? fmtDur(n.mfMs) : '—'}</td><td>${n.mfH.length ? n.mfH.map(([a, b]) => `${fmtClockS(a)}–${fmtClockS(b)}`).join(', ') : '—'}</td></tr>`;
    })
    .join('');
  el('tableView').innerHTML =
    `<table class="nt"><thead><tr><th>${MONL[mo.m - 1]} ${mo.y}</th><th>Sunset</th><th>Astro dusk</th><th>Astro dawn</th><th>Sunrise</th><th>Moon</th><th>Moonrise</th><th>Moonset</th><th>True dark</th><th>Moon-free</th><th>Window</th></tr></thead><tbody>${rows}</tbody></table>`;
  el('periodLabel').textContent = `${MONL[mo.m - 1]} ${mo.y}`;
}
