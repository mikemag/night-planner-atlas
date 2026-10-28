import { S, atlas } from '../app/state';
import { moonAltAt, phaseAt, windowsText } from '../model/describe';
import { fmtClock, fmtDur, MON3, WD3 } from '../model/format';
import { el } from './dom';

/** A fixed, non-live readout: pointer movement must not flood screen-reader announcements. */
export function updateRiverReadout(): void {
  const box = el('riverReadout');
  const hover = S.hover;
  const i = hover?.i ?? (S.riverReadoutSelected ? S.sel : -1);
  const n = atlas().nights[i];
  let value = '';
  if (n) {
    const date = `${WD3[n.dow]} ${MON3[n.m - 1]} ${n.d}, ${n.y}`;
    if (hover?.hh != null && S.riverZoom !== 'year') {
      const alt = moonAltAt(n, hover.hh);
      const moon =
        alt == null ? '' : ` · Moon center ${Math.round(alt).toString().replace('-', '−')}°`;
      value = `${date} · ${fmtClock(hover.hh)} · ${phaseAt(n, hover.hh).replace('True dark', 'Astronomical darkness')}${moon}`;
    } else {
      const total = n.mfMs
        ? `${fmtDur(n.mfMs)} moon-free`
        : n.tdMs
          ? 'No moon-free true dark'
          : 'No true dark';
      value = `${date} · ${total} · ${windowsText(n)}`;
    }
    const event = atlas().quarters.find((q) => q.q === 0 && q.i === i);
    if (event) {
      const p = atlas().tz.wallParts(event.t + 30_000);
      const clock = fmtClock(p.h + p.mi / 60 - 12);
      value += ` · New moon: ${MON3[p.m - 1]} ${p.d}, ${p.y} ${clock}`;
    }
  }
  if (box.textContent !== value) box.textContent = value;
}
