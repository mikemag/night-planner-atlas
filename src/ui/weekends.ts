import { S, atlas } from '../app/state';
import { MON3, fmtDur } from '../model/format';
import { weekendsAhead } from '../model/range';
import { el } from './dom';

/** The dark-weekends list; each button carries its Friday's night index in `data-i`. */
export function updateWeekends(): void {
  const r = atlas();
  const { nights } = r;
  const list = weekendsAhead(r);
  const box = el('insWeekends');
  box.textContent = '';
  const max = Math.max(1, ...list.map((w) => w.sum));
  for (const w of list) {
    const a = nights[w.i],
      b = nights[w.i + 1];
    const btn = document.createElement('button');
    btn.dataset.i = String(w.i);
    if (S.sel === w.i || S.sel === w.i + 1) btn.className = 'on';
    const d = document.createElement('span');
    d.textContent = `Fri ${MON3[a.m - 1]} ${a.d} – Sat ${b.m !== a.m ? MON3[b.m - 1] + ' ' : ''}${b.d}`;
    const v = document.createElement('span');
    v.textContent = fmtDur(w.sum);
    v.style.fontWeight = '650';
    const m = document.createElement('span');
    m.className = 'm';
    const f = document.createElement('i');
    f.style.width = ((100 * w.sum) / max).toFixed(0) + '%';
    m.appendChild(f);
    btn.append(d, v, m);
    btn.title = `${fmtDur(a.mfMs)} + ${fmtDur(b.mfMs)} usable dark`;
    box.appendChild(btn);
  }
}
