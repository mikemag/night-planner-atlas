import { S, atlas } from '../app/state';
import { phaseName, windowsText } from '../model/describe';
import { MON3, fmtClock, fmtDur, nightTitle } from '../model/format';
import { NS, STEP, wallH, type Night } from '../model/night';
import { weekendsAhead } from '../model/range';
import { MS_H, MS_M } from '../model/time';
import { C } from '../render/colors';
import { el } from './dom';

/** Show night `i` in the side panel: headline, altitude chart, moon, stages and dark weekends. */
export function inspect(i: number): void {
  const r = atlas();
  const { nights } = r;
  if (i < 0 || i >= nights.length) return;
  const n = nights[i];
  el('insDate').textContent = nightTitle(n);
  el('insSub').textContent = `Night ${n.id} · ${S.site.name}`;
  el('insBig').textContent = n.mfMs ? fmtDur(n.mfMs) : n.tdMs ? '0m' : '—';
  el('insCap').textContent =
    (n.mfMs ? 'Moon-free true dark · ' : '') +
    windowsText(n) +
    (n.moonIgnored && n.tdMs ? ' (moon ignored: under threshold)' : '');
  el('insChart').innerHTML = altitudeChartSVG(n, i === r.tonightIdx);
  // moon row
  const mr = n.moonRise != null ? fmtClock(wallH(n.moonRise, n)) : '—';
  const ms = n.moonSet != null ? fmtClock(wallH(n.moonSet, n)) : '—';
  el('insMoon').innerHTML =
    `${moonSVG(n.phase, 22)}<div><b>${Math.round(n.illum * 100)}% ${phaseName(n)}</b><br>Moonrise ${mr} · Moonset ${ms}</div>`;
  // stage durations
  const E = n.evH;
  const row = (
    label: string,
    sw: string,
    a: number | null,
    b: number | null,
    c: number | null,
    d: number | null,
  ) => {
    const cell = (s: number | null, e: number | null) =>
      s == null || e == null
        ? '<div class="v">—</div>'
        : `<div class="v">${fmtClock(s).replace(' ', '&nbsp;')}<small>${fmtDur((e - s) * MS_H)}</small></div>`;
    return `<div class="k"><i class="sw" style="background:${sw}"></i>${label}</div>${cell(a, b)}${cell(c, d)}`;
  };
  let html =
    '<div class="h">Stage</div><div class="h v">Evening</div><div class="h v">Morning</div>';
  html += row('Civil twilight', 'var(--sky-civil)', E.sunset, E.civilDusk, E.civilDawn, E.sunrise);
  html += row(
    'Nautical',
    'var(--sky-naut)',
    E.civilDusk,
    E.nauticalDusk,
    E.nauticalDawn,
    E.civilDawn,
  );
  html += row(
    'Astronomical',
    'var(--sky-astro)',
    E.nauticalDusk,
    E.astroDusk,
    E.astroDawn,
    E.nauticalDawn,
  );
  html += `<div class="k"><i class="sw" style="background:var(--sky-dark)"></i>True dark</div><div class="v" style="grid-column: span 2">${n.tdH ? `${fmtClock(n.tdH[0])} – ${fmtClock(n.tdH[1])}<small>${fmtDur(n.tdMs)}</small>` : 'none'}</div>`;
  html += `<div class="k"><i class="sw line" style="background:var(--good)"></i>Moon-free</div><div class="v" style="grid-column: span 2">${n.mfMs ? fmtDur(n.mfMs) : 'none'}<small>${n.tdMs ? Math.round((100 * n.mfMs) / n.tdMs) + '% of true dark' : ''}</small></div>`;
  html += `<div class="k">Sun</div><div class="v">Sets ${fmtClock(E.sunset)}</div><div class="v">Rises ${fmtClock(E.sunrise)}</div>`;
  el('insStages').innerHTML = html;
  const nm =
    n.nmOff === 0
      ? 'New-moon night'
      : `${Math.abs(n.nmOff)} night${Math.abs(n.nmOff) === 1 ? '' : 's'} ${n.nmOff < 0 ? 'before' : 'after'} new moon`;
  el('insFoot').textContent =
    `${nm}${n.dst ? ' · Clocks change tonight' : ''} · Times are ${S.site.tz.replace('_', ' ')} clock time`;
  renderWeekends();
}

/** The dark-weekends list; each button carries its Friday's night index in `data-i`. */
function renderWeekends(): void {
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
    btn.title = `${fmtDur(a.mfMs)} + ${fmtDur(b.mfMs)} moon-free`;
    box.appendChild(btn);
  }
}

export function moonSVG(phase: number, size: number): string {
  const r = size / 2 - 1,
    c = size / 2;
  const k = Math.cos((phase * Math.PI) / 180),
    waxing = phase < 180;
  const rx = Math.abs(k) * r;
  // lit region: limb semicircle plus terminator half-ellipse
  const top = `${c} ${c - r}`,
    bot = `${c} ${c + r}`;
  const d = waxing
    ? `M ${top} A ${r} ${r} 0 0 1 ${bot} A ${rx} ${r} 0 0 ${k > 0 ? 0 : 1} ${top} Z`
    : `M ${bot} A ${r} ${r} 0 0 1 ${top} A ${rx} ${r} 0 0 ${k > 0 ? 0 : 1} ${bot} Z`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${r}" fill="#2a3040" stroke="rgba(128,136,152,.6)"/><path d="${d}" fill="rgb(${C.moon})"/></svg>`;
}

/** The single-night altitude chart, drawn against elapsed time to avoid folding the repeated DST hour. */
export function altitudeChartSVG(n: Night, isTonight: boolean): string {
  const ev = n.ev;
  const g0 = ev.sunset != null ? ev.sunset : n.noon + 6 * MS_H;
  const g1 = ev.sunrise != null ? ev.sunrise : g0 + 13.2 * MS_H;
  const Wd = 340,
    Hd = 196,
    pl = 34,
    pr = 8,
    pt = 10,
    pb = 44;
  const pw = Wd - pl - pr,
    ph = Hd - pt - pb;
  const samples: Array<[number, number, number]> = [];
  for (let i = 0; i < NS; i++) {
    const t = n.S0 + i * STEP;
    if (t >= g0 - 12 * MS_M && t <= g1 + 12 * MS_M) samples.push([t, n.sunAlt[i], n.moonAlt[i]]);
  }
  const alts = samples.flatMap((p) => [p[1], p[2]]);
  const lo = Math.min(-18, Math.floor((Math.min(...alts) - 4) / 5) * 5);
  const hi = Math.max(0, Math.ceil((Math.max(...alts) + 4) / 5) * 5);
  const X = (t: number) => pl + ((Math.min(g1, Math.max(g0, t)) - g0) / (g1 - g0)) * pw;
  const Y = (a: number) => pt + ph - ((Math.min(hi, Math.max(lo, a)) - lo) / (hi - lo)) * ph;
  const band = (a: number | null, b: number | null, color: string, op: number) =>
    a == null || b == null
      ? ''
      : `<rect x="${X(a).toFixed(1)}" y="${pt}" width="${Math.max(0, X(b) - X(a)).toFixed(1)}" height="${ph}" fill="${color}" opacity="${op}"/>`;
  let s = `<svg class="ins-chart" viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="Sun and Moon center altitudes through the night; Moon events use its upper edge">`;
  s += `<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(47,189,120,0.14)"/><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(47,189,120,0.75)" stroke-width="1.2"/></pattern></defs>`;
  s += `<rect width="${Wd}" height="${Hd}" rx="10" fill="#0c111c"/>`;
  s +=
    band(ev.sunset, ev.civilDusk, '#a0703f', 0.55) +
    band(ev.civilDawn, ev.sunrise, '#a0703f', 0.55);
  s +=
    band(ev.civilDusk, ev.nauticalDusk, '#2f63b8', 0.5) +
    band(ev.nauticalDawn, ev.civilDawn, '#2f63b8', 0.5);
  s +=
    band(ev.nauticalDusk, ev.astroDusk, '#3d3a9a', 0.55) +
    band(ev.astroDawn, ev.nauticalDawn, '#3d3a9a', 0.55);
  if (n.td) s += band(n.td[0], n.td[1], '#000000', 0.75);
  for (const [a, b] of n.mf)
    s += `<rect x="${X(a).toFixed(1)}" y="${pt}" width="${Math.max(0, X(b) - X(a)).toFixed(1)}" height="${ph}" fill="url(#hatch)"/>`;
  s += `<line x1="${pl}" x2="${pl + pw}" y1="${Y(0)}" y2="${Y(0)}" stroke="rgba(200,208,222,.55)"/>`;
  s += `<line x1="${pl}" x2="${pl + pw}" y1="${Y(-18)}" y2="${Y(-18)}" stroke="rgba(200,208,222,.45)" stroke-dasharray="5 4"/>`;
  const path = (idx: 1 | 2) =>
    samples
      .map((p, k) => `${k ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[idx]).toFixed(1)}`)
      .join(' ');
  s += `<path d="${path(1)}" fill="none" stroke="#f3c64d" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<path d="${path(2)}" fill="none" stroke="#eef0f4" stroke-width="2" stroke-linejoin="round"/>`;
  const lab = (t: string, a: number) =>
    `<text x="${pl - 5}" y="${Y(a) + 3}" font-size="9" fill="#9aa4b6" text-anchor="end">${t}</text>`;
  s += lab('0°', 0) + lab('−18°', -18) + lab(`${hi}°`, hi) + lab(`${lo}°`, lo);
  const evs: Array<[keyof typeof ev, boolean]> = [
    ['sunset', true],
    ['civilDusk', true],
    ['nauticalDusk', true],
    ['astroDusk', true],
    ['astroDawn', false],
    ['nauticalDawn', false],
    ['civilDawn', false],
    ['sunrise', false],
  ];
  for (const [k, evening] of evs) {
    const t = ev[k];
    if (t == null || t < g0 - MS_M || t > g1 + MS_M) continue;
    const x = X(t);
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${pt}" y2="${pt + ph}" stroke="rgba(200,208,222,.28)"/>`;
    s += `<text transform="translate(${x.toFixed(1)} ${pt + ph + 7}) rotate(${evening ? 42 : -42})" font-size="8.5" font-weight="600" fill="#9aa4b6" text-anchor="${evening ? 'start' : 'end'}" dominant-baseline="middle">${fmtClock(wallH(t, n)).replace(' ', '')}</text>`;
  }
  if (isTonight) {
    const now = Date.now();
    if (now > g0 && now < g1)
      s += `<line x1="${X(now)}" x2="${X(now)}" y1="${pt}" y2="${pt + ph}" stroke="#2fbd78" stroke-width="2"/>`;
  }
  s += '</svg>';
  return s;
}
