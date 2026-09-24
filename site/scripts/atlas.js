// Night Planner Atlas: the whole app in one script for now (no build step).
// Sections: storage and settings, time zones, ephemeris and the night model,
// canvas drawing, the River / Calendar / Lunations views, inspector, controls.
// docs/night-model.md describes the computation; docs/design.md the views.
(() => {
'use strict';
const A = window.Astronomy;
const MS_M = 60e3, MS_H = 3600e3, MS_D = 86400e3;
const STEP = 10 * MS_M, NS = 121, S_OFF = 2 * MS_H;
const WD1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif';
const $ = id => document.getElementById(id);
const pad2 = v => String(v).padStart(2, '0');

// ---------- per-viewer conveniences (never required)
const store = {
  get(k, d) { try { const v = localStorage.getItem('npa:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('npa:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};
const DEFAULT_SITE = { name: 'Seattle', lat: 47.60621, lon: -122.34253, tz: 'America/Los_Angeles' };

const S = {
  view: store.get('view', 'river'),
  site: store.get('site', null) || DEFAULT_SITE,
  focus: store.get('focus', 0),
  moonAlt: store.get('moonAlt', 0),
  crescent: store.get('crescent', 0),
  calOrient: store.get('calOrient', 'v'),
  calZoom: store.get('calZoom', 'month'),
  riverZoom: store.get('riverZoom', 'month'),
  riverMark: store.get('riverMark', 'line'),
  rangeShift: 0,
  sel: -1,
  expandedWeek: null,
  hover: null,
};

// ---------- time zone helpers
let offCache = new Map();
let partsFmt = null;
function setTz(tz) {
  partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  offCache = new Map();
}
function offsetMin(ms) {
  const key = Math.floor(ms / MS_H);
  let v = offCache.get(key);
  if (v === undefined) {
    const p = {};
    for (const x of partsFmt.formatToParts(new Date(key * MS_H))) p[x.type] = x.value;
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    v = Math.round((wall - key * MS_H) / MS_M);
    offCache.set(key, v);
  }
  return v;
}
function utcForWall(wall) {
  let t = wall - offsetMin(wall) * MS_M;
  t = wall - offsetMin(t) * MS_M;
  return t;
}
function wallH(ms, n) { return (ms + offsetMin(ms) * MS_M - n.wallNoon) / MS_H; }
function wallParts(ms) {
  const w = new Date(ms + offsetMin(ms) * MS_M);
  return { y: w.getUTCFullYear(), m: w.getUTCMonth() + 1, d: w.getUTCDate(), h: w.getUTCHours(), mi: w.getUTCMinutes() };
}

// ---------- formatting
function clockParts(h) {
  let mins = Math.round((12 + h) * 60);
  mins = ((mins % 1440) + 1440) % 1440;
  const H = Math.floor(mins / 60), M = mins % 60;
  return { h12: H % 12 === 0 ? 12 : H % 12, M, am: H < 12 };
}
function fmtClock(h) { if (h == null) return '—'; const c = clockParts(h); return `${c.h12}:${pad2(c.M)} ${c.am ? 'AM' : 'PM'}`; }
function fmtClockS(h) { if (h == null) return '—'; const c = clockParts(h); return `${c.h12}:${pad2(c.M)}${c.am ? 'a' : 'p'}`; }
function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / MS_M));
  if (m < 1) return '0m';
  if (m < 60) return m + 'm';
  const H = Math.floor(m / 60), M = m % 60;
  return M ? `${H}h ${M}m` : `${H}h`;
}
function fmtHrs(ms) { return ms > 0 && ms < 0.05 * MS_H ? '<0.1' : (ms / MS_H).toFixed(1); }
function nightTitle(n) {
  const nx = new Date(Date.UTC(n.y, n.m - 1, n.d + 1));
  return `${WD3[n.dow]} ${MON3[n.m - 1]} ${n.d} → ${WD3[nx.getUTCDay()]} ${MON3[nx.getUTCMonth()]} ${nx.getUTCDate()}`;
}
function phaseName(n) {
  const a = n.phase;
  if (n.illum < 0.03) return 'New moon';
  if (n.illum > 0.97) return 'Full moon';
  if (Math.abs(n.illum - 0.5) < 0.06) return a < 180 ? 'First quarter' : 'Third quarter';
  if (n.illum < 0.5) return a < 180 ? 'Waxing crescent' : 'Waning crescent';
  return a < 180 ? 'Waxing gibbous' : 'Waning gibbous';
}

// ---------- ephemeris
let nights = [], ax = { start: 4, end: 20 }, quarters = [], lunations = [], months = [];
let maxMF = 1, ready = false, observer = null, tonightIdx = -1;

function rangeMonths() {
  const now = Date.now();
  const p = wallParts(now);
  let y = p.y, m = p.m - 1 + S.rangeShift * 12;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return { y, m, count: 14 };
}

function computeNight(y, m, d) {
  const wallNoon = Date.UTC(y, m - 1, d, 12);
  const noon = utcForWall(wallNoon);
  const t0 = new Date(noon);
  const find = (dir, alt) => {
    try { const r = A.SearchAltitude(A.Body.Sun, observer, dir, t0, 1, alt); return r ? r.date.getTime() : null; }
    catch (e) { return null; }
  };
  const ev = {
    sunset: find(-1, -0.833), civilDusk: find(-1, -6), nauticalDusk: find(-1, -12), astroDusk: find(-1, -18),
    astroDawn: find(+1, -18), nauticalDawn: find(+1, -12), civilDawn: find(+1, -6), sunrise: find(+1, -0.833),
  };
  const S0 = noon + S_OFF;
  const moonAlt = new Float32Array(NS), sunAlt = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const t = new Date(S0 + i * STEP);
    const em = A.Equator(A.Body.Moon, t, observer, true, true);
    moonAlt[i] = A.Horizon(t, observer, em.ra, em.dec, 'normal').altitude;
    const es = A.Equator(A.Body.Sun, t, observer, true, true);
    sunAlt[i] = A.Horizon(t, observer, es.ra, es.dec, 'normal').altitude;
  }
  const mid = utcForWall(Date.UTC(y, m - 1, d + 1, 0));
  const md = new Date(mid);
  const illum = A.Illumination(A.Body.Moon, md).phase_fraction;
  const phase = A.MoonPhase(md);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const n = { id: `${y}-${pad2(m)}-${pad2(d)}`, y, m, d, dow, wallNoon, noon, mid, S0, ev, moonAlt, sunAlt, illum, phase };
  n.evH = {};
  for (const k in ev) n.evH[k] = ev[k] == null ? null : wallH(ev[k], n);
  n.dst = offsetMin(noon) !== offsetMin(noon + 20 * MS_H);
  return n;
}

function crossings(arr, S0, thr) {
  const out = [];
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1] - thr, b = arr[i] - thr;
    if ((a > 0) !== (b > 0)) out.push({ t: S0 + (i - 1 + a / (a - b)) * STEP, rising: b > 0 });
  }
  return out;
}
function intervalsAbove(arr, S0, thr) {
  const out = [];
  let start = arr[0] > thr ? S0 : null;
  for (const c of crossings(arr, S0, thr)) {
    if (c.rising) start = c.t;
    else if (start != null) { out.push([start, c.t]); start = null; }
  }
  if (start != null) out.push([start, S0 + (arr.length - 1) * STEP]);
  return out;
}
function subtract(iv, cuts) {
  let segs = [iv];
  for (const [a, b] of cuts) {
    segs = segs.flatMap(([x, y]) => {
      if (b <= x || a >= y) return [[x, y]];
      const r = [];
      if (a > x) r.push([x, a]);
      if (b < y) r.push([b, y]);
      return r;
    });
  }
  return segs.filter(([x, y]) => y - x >= MS_M);
}

function derive(n) {
  const E = n.ev;
  n.moonUp = intervalsAbove(n.moonAlt, n.S0, S.moonAlt);
  n.moonUpH = n.moonUp.map(([a, b]) => [wallH(a, n), wallH(b, n)]);
  n.td = E.astroDusk != null && E.astroDawn != null && E.astroDawn > E.astroDusk ? [E.astroDusk, E.astroDawn] : null;
  n.tdH = n.td ? [n.evH.astroDusk, n.evH.astroDawn] : null;
  n.tdMs = n.td ? n.td[1] - n.td[0] : 0;
  n.moonIgnored = n.illum < S.crescent;
  n.mf = n.td ? (n.moonIgnored ? [n.td.slice()] : subtract(n.td, n.moonUp)) : [];
  n.mfH = n.mf.map(([a, b]) => [wallH(a, n), wallH(b, n)]);
  n.mfMs = n.mf.reduce((s, [a, b]) => s + b - a, 0);
  const hz = crossings(n.moonAlt, n.S0, 0);
  const rise = hz.find(c => c.rising), set = hz.find(c => !c.rising);
  n.moonRise = rise ? rise.t : null;
  n.moonSet = set ? set.t : null;
}

function deriveAll() {
  maxMF = 1;
  for (const n of nights) { derive(n); maxMF = Math.max(maxMF, n.mfMs); }
  for (const L of lunations) bestWeekend(L);
  for (const mo of months) monthStats(mo);
}

function nightIndexForTime(t) { return Math.round((t - nights[0].mid) / MS_D); }

function buildStructures() {
  // axis from the loaded year: earliest sunset to latest sunrise, padded
  let lo = 99, hi = -99;
  for (const n of nights) {
    if (n.evH.sunset != null) lo = Math.min(lo, n.evH.sunset);
    if (n.evH.sunrise != null) hi = Math.max(hi, n.evH.sunrise);
  }
  if (lo > hi) { lo = 4; hi = 20; }
  ax = { start: Math.floor((lo - 0.3) * 2) / 2, end: Math.ceil((hi + 0.3) * 2) / 2 };

  // moon quarters + new-moon alignment
  quarters = [];
  const first = nights[0].noon, last = nights[nights.length - 1].noon + MS_D;
  let mq = A.SearchMoonQuarter(new Date(first - 20 * MS_D));
  while (mq.time.date.getTime() < last + 20 * MS_D) {
    quarters.push({ q: mq.quarter, t: mq.time.date.getTime(), i: nightIndexForTime(mq.time.date.getTime()) });
    mq = A.NextMoonQuarter(mq);
  }
  for (const n of nights) n.quarter = -1;
  for (const q of quarters) if (q.i >= 0 && q.i < nights.length) nights[q.i].quarter = q.q;
  const nm = quarters.filter(q => q.q === 0);
  lunations = nm.filter(q => q.i + 7 >= 0 && q.i - 7 < nights.length).map(q => ({ t: q.t, i: q.i }));
  nights.forEach((n, i) => {
    let best = null;
    for (const q of nm) { const off = i - q.i; if (best == null || Math.abs(off) < Math.abs(best)) best = off; }
    n.nmOff = best == null ? 99 : best;
  });

  // months and weeks (Sunday first)
  months = [];
  const byKey = new Map();
  nights.forEach((n, i) => {
    const key = `${n.y}-${pad2(n.m)}`;
    let mo = byKey.get(key);
    if (!mo) { mo = { key, y: n.y, m: n.m, idx: [] }; byKey.set(key, mo); months.push(mo); }
    mo.idx.push(i);
  });
  for (const mo of months) {
    const firstDow = nights[mo.idx[0]].dow;
    const cells = new Array(firstDow).fill(-1).concat(mo.idx);
    while (cells.length % 7) cells.push(-1);
    mo.weeks = [];
    for (let k = 0; k < cells.length; k += 7) mo.weeks.push(cells.slice(k, k + 7));
  }
  const now = Date.now();
  const p = wallParts(now);
  let tonight = `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
  if (p.h < 12) { const yd = new Date(Date.UTC(p.y, p.m - 1, p.d - 1)); tonight = `${yd.getUTCFullYear()}-${pad2(yd.getUTCMonth() + 1)}-${pad2(yd.getUTCDate())}`; }
  tonightIdx = nights.findIndex(n => n.id === tonight);
}

function monthStats(mo) {
  let total = 0, good = 0;
  for (const i of mo.idx) { total += nights[i].mfMs; if (nights[i].mfMs >= 4 * MS_H) good++; }
  mo.total = total; mo.good = good;
  mo.nm = quarters.filter(q => q.q === 0 && q.i >= mo.idx[0] && q.i <= mo.idx[mo.idx.length - 1]).map(q => q.i);
  mo.fm = quarters.filter(q => q.q === 2 && q.i >= mo.idx[0] && q.i <= mo.idx[mo.idx.length - 1]).map(q => q.i);
}

function lunWindow() { return S.focus > 0 ? S.focus : 14; }
function bestWeekend(L) {
  const N = lunWindow();
  let best = null, total = 0;
  for (let k = -N; k <= N; k++) {
    const i = L.i + k;
    if (i < 0 || i >= nights.length) continue;
    total += nights[i].mfMs;
    if (nights[i].dow === 5 && k + 1 <= N && i + 1 < nights.length) {
      const sum = nights[i].mfMs + nights[i + 1].mfMs;
      if (!best || sum > best.sum) best = { i, sum };
    }
  }
  L.best = best; L.total = total;
}

function computeAll(done) {
  ready = false;
  $('loading').hidden = false;
  setTz(S.site.tz);
  observer = new A.Observer(S.site.lat, S.site.lon, 0);
  const r = rangeMonths();
  const list = [];
  let y = r.y, m = r.m;
  for (let k = 0; k < r.count; k++) {
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) list.push([y, m, d]);
    m++; if (m > 12) { m = 1; y++; }
  }
  const out = [];
  let k = 0;
  const token = {};
  computeAll.token = token;
  function chunk() {
    if (computeAll.token !== token) return;
    const t = performance.now();
    while (k < list.length && performance.now() - t < 24) { out.push(computeNight(...list[k])); k++; }
    $('loadingBar').style.width = (100 * k / list.length).toFixed(0) + '%';
    if (k < list.length) { setTimeout(chunk, 0); return; }
    nights = out;
    buildStructures();
    deriveAll();
    ready = true;
    $('loading').hidden = true;
    done && done();
  }
  chunk();
}

// ---------- colors (read from theme tokens)
let C = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = k => cs.getPropertyValue(k).trim();
  C = {
    day: g('--sky-day'), civil: g('--sky-civil'), naut: g('--sky-naut'), astro: g('--sky-astro'), dark: g('--sky-dark'),
    moon: g('--moon-rgb'), good: g('--good'), ink: g('--ink'), ink2: g('--ink-2'), ink3: g('--ink-3'),
    hair: g('--hair'), hair2: g('--hair-2'), panel: g('--panel'), raised: g('--raised'), chip: g('--chip'),
    select: g('--select'), now: g('--now'), weekend: g('--weekend'), accent: g('--accent'),
  };
  $('moonSw').style.background = `linear-gradient(90deg, rgba(${C.moon},0.2), rgba(${C.moon},0.8))`;
}
function inkOn(hex) {
  const c = hex.replace('#', '');
  if (c.length < 6) return C.ink;
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? '#111726' : '#ffffff';
}
function moonAlpha(illum) { return 0.17 + 0.40 * Math.pow(illum, 0.8); }

// ---------- canvas plumbing
const cv = $('cv'), ctx = cv.getContext('2d');
const scroller = $('scroller'), sizer = $('sizer');
let W = 0, H = 0, dpr = 1;
const snap = v => Math.round(v * dpr) / dpr;
function font(px, weight = 500) { return `${weight} ${px}px ${FONT}`; }
function text(s, x, y, px, color, align = 'left', weight = 500, base = 'middle') {
  ctx.font = font(px, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, x, y);
}
function tw(s, px, weight = 500) { ctx.font = font(px, weight); return ctx.measureText(s).width; }
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

function chevron(cx, cy, open, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (open) { ctx.moveTo(cx - 4, cy - 2); ctx.lineTo(cx, cy + 2); ctx.lineTo(cx + 4, cy - 2); }
  else { ctx.moveTo(cx - 2, cy - 4); ctx.lineTo(cx + 2, cy); ctx.lineTo(cx - 2, cy + 4); }
  ctx.stroke();
}
function resize() {
  W = scroller.clientWidth; H = scroller.clientHeight; dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  relayout();
}
function relayout(keepNight) {
  const v = views[S.view];
  if (!v || !v.canvas || !ready) return;
  v.layout();
  sizer.style.height = Math.max(0, v.total - H) + 'px';
  if (keepNight != null && keepNight >= 0) v.scrollTo(keepNight, true);
  draw();
}
let raf = 0;
function draw() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const v = views[S.view];
    if (!v || !v.canvas || !ready) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, H);
    v.draw(scroller.scrollTop);
    updatePeriod();
  });
}

// ---------- drawing a single night
// o = 'h': clock time runs left → right; o = 'v': clock time runs top → bottom
function drawNight(n, x, y, w, h, o, opt = {}) {
  const L = o === 'h' ? w : h;
  const span = ax.end - ax.start;
  const P = t => snap((t - ax.start) / span * L);
  const seg = (a, b, color) => {
    let p0 = P(a), p1 = P(b);
    if (p0 < 0) p0 = 0; if (p1 > L) p1 = L; if (!(p1 > p0)) return;
    ctx.fillStyle = color;
    if (o === 'h') ctx.fillRect(x + p0, y, p1 - p0, h); else ctx.fillRect(x, y + p0, w, p1 - p0);
  };
  const E = n.evH;
  const dim = opt.dim ? 0.35 : 1;
  ctx.globalAlpha = dim;
  seg(ax.start, ax.end, C.day);
  if (E.sunset != null && E.sunrise != null) seg(E.sunset, E.sunrise, C.civil);
  if (E.civilDusk != null && E.civilDawn != null) seg(E.civilDusk, E.civilDawn, C.naut);
  if (E.nauticalDusk != null && E.nauticalDawn != null) seg(E.nauticalDusk, E.nauticalDawn, C.astro);
  if (n.tdH) seg(n.tdH[0], n.tdH[1], C.dark);
  if (n.tdH) {
    const col = `rgba(${C.moon},${moonAlpha(n.illum).toFixed(3)})`;
    for (const [a, b] of n.moonUpH) {
      const s = Math.max(a, n.tdH[0]), e = Math.min(b, n.tdH[1]);
      if (e > s) seg(s, e, col);
    }
  }
  if (opt.mark !== false && n.mfH.length && (o === 'h' ? h >= 5 : w >= 5)) {
    ctx.fillStyle = C.good;
    const th = o === 'h' ? Math.max(1.5, Math.min(2, h * 0.12)) : Math.max(1.5, Math.min(2, w * 0.06));
    for (const [a, b] of n.mfH) {
      let p0 = P(a), p1 = P(b);
      if (p0 < 0) p0 = 0; if (p1 > L) p1 = L; if (!(p1 > p0)) continue;
      if (o === 'h') ctx.fillRect(x + p0, y + h - th, p1 - p0, th); else ctx.fillRect(x, y + p0, th, p1 - p0);
    }
  }
  if (opt.curve && o === 'h') {
    const aMin = -25, aMax = 65;
    const Y = alt => y + h * (1 - (alt - aMin) / (aMax - aMin));
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, snap(Y(0)) + 0.5); ctx.lineTo(x + w, snap(Y(0)) + 0.5); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = `rgba(${C.moon},0.95)`; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    let prev = -1e9;
    for (let i = 0; i < NS; i++) {
      const hh = wallH(n.S0 + i * STEP, n);
      const px = x + (hh - ax.start) / span * w, py = Y(n.moonAlt[i]);
      if (i === 0 || hh < prev) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      prev = hh;
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  if (opt.labels && n.mfH.length) {
    for (const [a, b] of n.mfH) {
      const p0 = Math.max(0, P(a)), p1 = Math.min(L, P(b));
      if (o === 'h') {
        if (p1 - p0 < 84) continue;
        const cy = opt.labelY != null ? opt.labelY : y + h / 2 - 1;
        text(fmtClockS(a), x + p0 + 5, cy, 10.5, '#ffffff', 'left', 600);
        text(fmtClockS(b), x + p1 - 5, cy, 10.5, '#ffffff', 'right', 600);
      } else {
        if (p1 - p0 < 34 || w < 36) continue;
        text(fmtClockS(a), x + w / 2 + 1, y + p0 + 8, 10, '#ffffff', 'center', 600);
        text(fmtClockS(b), x + w / 2 + 1, y + p1 - 8, 10, '#ffffff', 'center', 600);
      }
    }
  }
}

function skyColorAt(n, hh) {
  const E = n.evH;
  const inside = (a, b) => a != null && b != null && hh >= a && hh < b;
  if (n.tdH && hh >= n.tdH[0] && hh < n.tdH[1]) return C.dark;
  if (inside(E.nauticalDusk, E.nauticalDawn)) return C.astro;
  if (inside(E.civilDusk, E.civilDawn)) return C.naut;
  if (inside(E.sunset, E.sunrise)) return C.civil;
  return C.day;
}
function eventLabelsH(n, x, y, w, h, horizonY) {
  // sunset / sunrise sit on the day color; moonrise / moonset only when inside the night and not already a window edge
  const span = ax.end - ax.start;
  const X = hh => x + (hh - ax.start) / span * w;
  const dayInk = inkOn(C.day), cy = y + h - 10;
  if (n.evH.sunset != null) text(`sunset ${fmtClockS(n.evH.sunset)}`, X(n.evH.sunset) - 5, cy, 10, dayInk, 'right', 600);
  if (n.evH.sunrise != null) text(`sunrise ${fmtClockS(n.evH.sunrise)}`, X(n.evH.sunrise) + 5, cy, 10, dayInk, 'left', 600);
  const edges = n.mfH.flat();
  for (const [t, lab] of [[n.moonRise, 'moonrise'], [n.moonSet, 'moonset']]) {
    if (t == null || n.evH.sunset == null || n.evH.sunrise == null) continue;
    const hh = wallH(t, n);
    if (hh < n.evH.sunset || hh > n.evH.sunrise || edges.some(e => Math.abs(e - hh) < 0.1)) continue;
    const mx = X(hh);
    ctx.fillStyle = `rgb(${C.moon})`; ctx.beginPath(); ctx.arc(mx, horizonY, 2.5, 0, Math.PI * 2); ctx.fill();
    text(`${lab} ${fmtClockS(hh)}`, mx + (lab === 'moonrise' ? -6 : 6), horizonY - 8, 10, inkOn(skyColorAt(n, hh)), lab === 'moonrise' ? 'right' : 'left', 600);
  }
}

function drawMoonGlyph(cx, cy, r, phase, litColor, darkColor, ring) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = darkColor; ctx.fill();
  if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 1; ctx.stroke(); }
  const k = Math.cos(phase * Math.PI / 180);
  const waxing = phase < 180;
  ctx.beginPath();
  if (waxing) {
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
    if (k > 0) ctx.ellipse(cx, cy, r * k, r, 0, Math.PI / 2, -Math.PI / 2, true);
    else ctx.ellipse(cx, cy, r * -k, r, 0, Math.PI / 2, Math.PI * 1.5, false);
  } else {
    ctx.arc(cx, cy, r, Math.PI / 2, Math.PI * 1.5, false);
    if (k > 0) ctx.ellipse(cx, cy, r * k, r, 0, Math.PI * 1.5, Math.PI / 2, true);
    else ctx.ellipse(cx, cy, r * -k, r, 0, -Math.PI / 2, Math.PI / 2, false);
  }
  ctx.closePath();
  ctx.fillStyle = litColor; ctx.fill();
}
function moonGlyph(n, cx, cy, r) {
  drawMoonGlyph(cx, cy, r, n.phase, `rgb(${C.moon})`, '#2a3040', 'rgba(128,136,152,0.55)');
}

// hour ticks shared by the horizontal axis views
function hourTicks(pxPerHour) {
  const every = pxPerHour >= 46 ? 1 : pxPerHour >= 24 ? 2 : 3;
  const out = [];
  for (let hh = Math.ceil(ax.start); hh <= Math.floor(ax.end); hh++) {
    const clock = ((12 + hh) % 24 + 24) % 24;
    out.push({ hh, major: clock % every === 0, midnight: clock === 0, label: clock === 0 ? '12a' : clock === 12 ? '12p' : `${clock % 12}${clock < 12 ? 'a' : 'p'}` });
  }
  return out;
}

// ---------- RIVER: one row per night, clock time across
const River = {
  canvas: true, AX: 30, GL: 70, GM: 22, GR: 92, MINI: 0,
  hs: null, ys: null, total: 0,
  geom() {
    this.MINI = S.riverZoom === 'year' || W < 700 ? 0 : 58;
    this.GR = W < 700 ? 56 : 92;
    this.GL = W < 700 ? 52 : 70;
    const x0 = this.GL + this.GM, x1 = W - this.GR - this.MINI;
    return { x0, x1, cw: Math.max(40, x1 - x0) };
  },
  heights() {
    const N = nights.length;
    const avail = H - this.AX - 10;
    const z = S.riverZoom;
    if (z === 'year') { const b = Math.max(1, avail / N); return { base: b, fH: b, cH: b }; }
    if (z === 'month') return { base: 20, fH: 34, cH: 8 };
    return { base: 74, fH: 74, cH: 14 };
  },
  layout() {
    const N = nights.length;
    this.hs = new Float64Array(N); this.ys = new Float64Array(N + 1);
    const { base, fH, cH } = this.heights();
    let y = 0;
    for (let i = 0; i < N; i++) {
      let h = base;
      if (S.focus > 0 && S.riverZoom !== 'year') h = Math.abs(nights[i].nmOff) <= S.focus ? fH : cH;
      this.ys[i] = y; this.hs[i] = h; y += h;
    }
    this.ys[N] = y;
    this.total = this.AX + y + 12;
  },
  rowAt(cy) {
    let lo = 0, hi = nights.length - 1;
    if (!this.ys || cy < 0) return -1;
    if (cy >= this.ys[nights.length]) return -1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.ys[mid] <= cy) lo = mid; else hi = mid - 1; }
    return lo;
  },
  topNight() { return Math.max(0, this.rowAt(scroller.scrollTop)); },
  scrollTo(i, top) {
    const y = this.ys[i];
    const vis0 = scroller.scrollTop, vis1 = vis0 + H - this.AX;
    if (top || y < vis0 || y + this.hs[i] > vis1) scroller.scrollTop = Math.max(0, y - (top ? 0 : (H - this.AX) * 0.3));
  },
  draw(st) {
    const { x0, x1, cw } = this.geom();
    const top = this.AX, N = nights.length;
    const span = ax.end - ax.start;
    const X = hh => x0 + (hh - ax.start) / span * cw;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, top, W - this.MINI, H - top); ctx.clip();
    let i0 = Math.max(0, this.rowAt(st));
    let lastMonth = -1;
    for (let i = i0; i < N; i++) {
      const y = top + this.ys[i] - st, h = this.hs[i];
      if (y > H) break;
      const n = nights[i];
      const gap = h >= 7 ? 1 : 0;
      const focusRow = S.focus > 0 && Math.abs(n.nmOff) <= S.focus;
      // weekend tint in the gutter
      if ((n.dow === 5 || n.dow === 6) && h >= 11) { ctx.fillStyle = C.weekend; ctx.fillRect(0, y, this.GL + this.GM - 2, h - gap); }
      drawNight(n, x0, y, cw, h - gap, 'h', {
        mark: S.riverMark === 'line',
        labels: h >= 26,
        curve: h >= 56,
        labelY: h >= 56 ? y + 11 : null,
      });
      if (h >= 56) eventLabelsH(n, x0, y, cw, h - gap, y + (h - gap) * (1 - 25 / 90));
      // gutter labels
      if (h >= 11) {
        const wk = n.dow === 5 || n.dow === 6;
        text(`${WD3[n.dow]} ${n.d}`, this.GL - 6, y + (h - gap) / 2, h >= 16 ? 11 : 10, wk ? C.ink : C.ink3, 'right', wk ? 650 : 500);
      }
      if (n.d === 1) {
        ctx.fillStyle = C.panel; ctx.fillRect(0, y - 1, W - this.MINI, 1);
        if (h >= 11) text(MON3[n.m - 1], 8, y + (h - gap) / 2, 11, C.ink, 'left', 700);
        else text(`${MON3[n.m - 1]}${n.m === 1 ? ' ' + n.y : ''}`, 8, y + 6, 10.5, C.ink, 'left', 700);
      }
      // moon column
      const mx = this.GL + this.GM / 2;
      if (h >= 13) moonGlyph(n, mx, y + (h - gap) / 2, Math.min(6, (h - gap) / 2 - 1.5));
      else if (n.quarter === 0 || n.quarter === 2) moonGlyph(n, mx, y + h / 2, 4);
      // right gutter: moon-free hours
      const bx = x1 + 8, bw = this.GR - 44;
      const bh = Math.max(1, Math.min(h - gap - 2, 9));
      const len = bw * n.mfMs / maxMF;
      if (len > 0) { ctx.fillStyle = C.good; ctx.fillRect(bx, y + (h - gap - bh) / 2, len, bh); }
      if (h >= 12) text(n.mfMs ? fmtHrs(n.mfMs) + 'h' : '—', bx + bw + 4, y + (h - gap) / 2, 10.5, n.mfMs ? C.ink2 : C.ink3, 'left', focusRow ? 650 : 500);
      // DST marker
      if (n.dst && h >= 11) text('Clocks change tonight', x0 + 6, y + (h - gap) / 2, 10, inkOn(C.day), 'left', 650);
      // tonight + selection
      if (i === tonightIdx) {
        ctx.fillStyle = C.now; ctx.fillRect(0, y, 3, h - gap);
        const nowH = wallH(Date.now(), n);
        if (nowH > ax.start && nowH < ax.end) { ctx.fillStyle = C.now; ctx.fillRect(snap(X(nowH)) - 1, y, 2, h - gap); }
      }
      if (i === S.sel) {
        ctx.strokeStyle = C.select; ctx.lineWidth = 2;
        ctx.strokeRect(x0 - 1, y - 1 + 0.0, cw + 2, h - gap + 2);
      }
      if (S.hover && S.hover.i === i && i !== S.sel) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y + 0.5, cw - 1, h - gap - 1);
      }
    }
    // hour grid over the night
    const ticks = hourTicks(cw / span);
    for (const t of ticks) {
      const x = snap(X(t.hh));
      ctx.fillStyle = t.midnight ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)';
      ctx.fillRect(x, top, 1, H - top);
    }
    // hover crosshair
    if (S.hover && S.hover.hh != null) {
      ctx.fillStyle = C.select; ctx.fillRect(snap(X(S.hover.hh)), top, 1, H - top);
    }
    ctx.restore();
    // axis band
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, top);
    ctx.fillStyle = C.hair; ctx.fillRect(0, top - 1, W, 1);
    for (const t of ticks) {
      if (!t.major) continue;
      text(t.label, X(t.hh), top - 12, 11, t.midnight ? C.ink : C.ink3, 'center', t.midnight ? 650 : 500);
    }
    const f = nights[Math.max(0, this.rowAt(st))];
    text(f ? `${MONL[f.m - 1]} ${f.y}` : 'Night of', 8, top - 12, 11, C.ink, 'left', 700);
    text('Moon-free', x1 + 8, top - 12, 10.5, C.ink3, 'left', 600);
    if (S.hover && S.hover.hh != null) {
      const s = fmtClock(S.hover.hh), wv = tw(s, 11, 650) + 10, cx = X(S.hover.hh);
      ctx.fillStyle = C.select; roundRect(cx - wv / 2, top - 22, wv, 18, 4); ctx.fill();
      text(s, cx, top - 12.5, 11, '#fff', 'center', 650);
    }
    if (this.MINI) this.drawMini(st);
  },
  drawMini(st) {
    const x = W - this.MINI + 12, w = this.MINI - 18, y0 = this.AX + 6, hAvail = H - this.AX - 14;
    const N = nights.length, rh = hAvail / N;
    ctx.fillStyle = C.panel; ctx.fillRect(W - this.MINI, this.AX, this.MINI, H - this.AX);
    ctx.fillStyle = C.hair; ctx.fillRect(W - this.MINI, this.AX, 1, H - this.AX);
    for (let i = 0; i < N; i++) {
      drawNight(nights[i], x, y0 + i * rh, w, Math.max(1, rh + 0.35), 'h', { mark: false });
      if (nights[i].d === 1) text(MON3[nights[i].m - 1][0], x - 6, y0 + i * rh + 4, 8.5, C.ink3, 'center', 600);
    }
    const a = this.rowAt(st), b = this.rowAt(st + H - this.AX - 1);
    const i0 = a < 0 ? 0 : a, i1 = b < 0 ? N - 1 : b;
    ctx.strokeStyle = C.select; ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 2.5, y0 + i0 * rh - 1, w + 5, (i1 - i0 + 1) * rh + 2);
  },
  hit(px, py) {
    const { x0, x1, cw } = this.geom();
    if (this.MINI && px > W - this.MINI) return { mini: true, y: py };
    if (py < this.AX) return null;
    const i = this.rowAt(py - this.AX + scroller.scrollTop);
    if (i < 0) return null;
    const hh = px >= x0 && px <= x1 ? ax.start + (px - x0) / cw * (ax.end - ax.start) : null;
    return { i, hh };
  },
  miniScroll(py) {
    const hAvail = H - this.AX - 14, N = nights.length;
    const i = Math.max(0, Math.min(N - 1, Math.floor((py - this.AX - 6) / hAvail * N)));
    scroller.scrollTop = Math.max(0, this.ys[i] - (H - this.AX) / 2);
  },
};

// ---------- CALENDAR: month grid, each day cell holds that night
const Cal = {
  canvas: true, PAD: 12, GUT: 36, HEAD: 60, WDH: 20, MGAP: 22,
  blocks: [], total: 0,
  weekKey(mo, wi) { return `${mo.key}:${wi}`; },
  weekH(mo, wk, wi) {
    const v = S.calOrient === 'v';
    if (S.expandedWeek === this.weekKey(mo, wi)) return v ? 340 : 206;
    if (S.focus > 0) {
      const any = wk.some(i => i >= 0 && Math.abs(nights[i].nmOff) <= S.focus);
      return any ? (v ? 150 : 104) : (v ? 64 : 56);
    }
    return v ? 132 : 96;
  },
  layout() {
    this.blocks = [];
    let y = 6;
    if (S.calZoom === 'year') return this.layoutYear();
    for (const mo of months) {
      this.blocks.push({ t: 'head', mo, y, h: this.HEAD }); y += this.HEAD;
      this.blocks.push({ t: 'wd', mo, y, h: this.WDH }); y += this.WDH;
      mo.weeks.forEach((wk, wi) => { const h = this.weekH(mo, wk, wi); this.blocks.push({ t: 'week', mo, wk, wi, y, h }); y += h; });
      y += this.MGAP;
    }
    this.total = y + 20;
  },
  layoutYear() {
    const cols = W >= 1100 ? 4 : W >= 720 ? 3 : 2;
    const gap = 18;
    const mw = (W - this.PAD * 2 - gap * (cols - 1)) / cols;
    const cw = mw / 7, ch = Math.min(52, cw * 1.35);
    this.yr = { cols, mw, cw, ch, gap };
    let y = 8;
    for (let k = 0; k < months.length; k += cols) {
      const rowMonths = months.slice(k, k + cols);
      const weeks = Math.max(...rowMonths.map(mo => mo.weeks.length));
      const h = 26 + 16 + weeks * ch + 8;
      rowMonths.forEach((mo, j) => this.blocks.push({ t: 'mini', mo, x: this.PAD + j * (mw + gap), y, w: mw, h }));
      y += h + 14;
    }
    this.total = y + 10;
  },
  topNight() {
    const st = scroller.scrollTop;
    for (const b of this.blocks) if (b.y + b.h > st && b.mo) return b.mo.idx[0];
    return 0;
  },
  scrollTo(i, top) {
    const b = this.blocks.find(b => (b.t === 'week' && b.wk.includes(i)) || (b.t === 'mini' && b.mo.idx.includes(i)));
    if (!b) return;
    const mh = this.blocks.find(x => x.t === 'head' && x.mo === b.mo);
    const target = S.calZoom === 'year' ? b.y - 8 : (top && mh ? mh.y - 4 : b.y);
    const vis0 = scroller.scrollTop, vis1 = vis0 + H;
    if (top || b.y < vis0 + 40 || b.y + b.h > vis1) scroller.scrollTop = Math.max(0, top ? target : b.y - H * 0.35);
  },
  cols() { const cw = (W - this.PAD * 2 - this.GUT) / 7; return { x0: this.PAD + this.GUT, cw }; },
  draw(st) {
    if (S.calZoom === 'year') return this.drawYear(st);
    const { x0, cw } = this.cols();
    for (const b of this.blocks) {
      const y = b.y - st;
      if (y + b.h < 0) continue;
      if (y > H) break;
      if (b.t === 'head') this.drawHead(b.mo, y, x0, cw);
      else if (b.t === 'wd') this.drawWd(y, x0, cw);
      else this.drawWeek(b, y, x0, cw);
    }
    // sticky month title while inside a month
    const cur = this.blocks.find(b => b.t === 'head' && b.y - st < 0 && b.y + b.h - st < 0 && this.monthEnd(b.mo) - st > 60);
    if (cur) {
      ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, 26);
      ctx.fillStyle = C.hair; ctx.fillRect(0, 26, W, 1);
      text(`${MONL[cur.mo.m - 1]} ${cur.mo.y}`, this.PAD, 13, 13, C.ink, 'left', 700);
      for (let d = 0; d < 7; d++) text(WD3[d], x0 + d * cw + cw / 2, 13, 10.5, d >= 5 ? C.ink : C.ink3, 'center', 600);
    }
  },
  monthEnd(mo) { let e = 0; for (const b of this.blocks) if (b.mo === mo) e = Math.max(e, b.y + b.h); return e; },
  drawHead(mo, y, x0, cw) {
    text(`${MONL[mo.m - 1]}`, this.PAD, y + 22, 21, C.ink, 'left', 700);
    const tw1 = tw(`${MONL[mo.m - 1]}`, 21, 700);
    text(`${mo.y}`, this.PAD + tw1 + 8, y + 24, 14, C.ink3, 'left', 500);
    const nmTxt = mo.nm.map(i => `${WD3[nights[i].dow]} ${nights[i].d}`).join(', ') || '—';
    const fmTxt = mo.fm.map(i => `${WD3[nights[i].dow]} ${nights[i].d}`).join(', ') || '—';
    const line = `${Math.round(mo.total / MS_H)}h moon-free dark · ${mo.good} nights ≥ 4h · New moon ${nmTxt} · Full ${fmTxt}`;
    text(line, this.PAD, y + 46, 11.5, C.ink2, 'left', 500);
    // sparkline of moon-free hours across the month (one column per night)
    const sw = Math.min(7 * cw * 0.42, 300), sx = x0 + 7 * cw - sw, sh = 30, sy = y + 12;
    const nN = mo.idx.length, bw = sw / nN;
    ctx.fillStyle = C.hair; ctx.fillRect(sx, sy + sh, sw, 1);
    mo.idx.forEach((i, k) => {
      const n = nights[i], hgt = sh * n.mfMs / maxMF;
      const wk = n.dow === 5 || n.dow === 6;
      ctx.fillStyle = C.good; ctx.globalAlpha = wk ? 1 : 0.45;
      ctx.fillRect(sx + k * bw + 0.5, sy + sh - hgt, Math.max(1, bw - 1.5), hgt);
      ctx.globalAlpha = 1;
      if (n.quarter === 0) moonGlyph(n, sx + k * bw + bw / 2, sy + sh + 8, 3.5);
      if (n.quarter === 2) moonGlyph(n, sx + k * bw + bw / 2, sy + sh + 8, 3.5);
    });
    text('Moon-free hours per night (weekends solid)', sx, sy - 5, 9.5, C.ink3, 'left', 500);
  },
  drawWd(y, x0, cw) {
    for (let d = 0; d < 7; d++) text(WD3[d], x0 + d * cw + cw / 2, y + 10, 10.5, d >= 5 ? C.ink : C.ink3, 'center', 600);
  },
  drawWeek(b, y, x0, cw) {
    const { mo, wk, wi } = b;
    const v = S.calOrient === 'v';
    const expanded = S.expandedWeek === this.weekKey(mo, wi);
    const compact = !expanded && b.h <= 66;
    const g = 2;
    // gutter: expand affordance + hour labels
    const gx = this.PAD, gw = this.GUT - 6;
    const hovG = S.hover && S.hover.gutter === this.weekKey(mo, wi);
    ctx.fillStyle = expanded || hovG ? C.chip : 'transparent';
    roundRect(gx, y + 2, gw, b.h - 4, 5); ctx.fill();
    chevron(gx + gw / 2, y + 11, expanded, hovG || expanded ? C.ink : C.ink3);
    const headH = compact ? 15 : 19, footH = compact ? 0 : (v ? 18 : 34);
    const bodyY = y + headH, bodyH = b.h - headH - footH - g;
    if (v && !compact && cw > 50) {
      // hour labels for the vertical time axis
      const span = ax.end - ax.start;
      for (const t of hourTicks(bodyH / span * 1.6)) {
        if (!t.major && !t.midnight) continue;
        const ty = bodyY + (t.hh - ax.start) / span * bodyH;
        if (ty < bodyY + 16) continue;
        text(t.label, gx + gw / 2, ty, 9, t.midnight ? C.ink2 : C.ink3, 'center', t.midnight ? 650 : 500);
      }
    }
    for (let d = 0; d < 7; d++) {
      const i = wk[d];
      const cx = x0 + d * cw, cwi = cw - g;
      if (i < 0) continue;
      const n = nights[i];
      const inFocus = S.focus > 0 && Math.abs(n.nmOff) <= S.focus;
      const dimmed = S.focus > 0 && !inFocus;
      // cell background
      ctx.fillStyle = C.raised; ctx.fillRect(cx, y, cwi, b.h - g);
      if (n.dow === 5 || n.dow === 6) { ctx.fillStyle = C.weekend; ctx.fillRect(cx, y, cwi, headH); }
      // header: day number + moon
      const dn = n.d === 1 ? `${MON3[n.m - 1]} 1` : `${n.d}`;
      text(dn, cx + 5, y + headH / 2 + 0.5, compact ? 10.5 : 12, dimmed ? C.ink3 : C.ink, 'left', 650);
      if (cwi > 70 && !compact) {
        moonGlyph(n, cx + cwi - 10, y + headH / 2, 5);
        text(`${Math.round(n.illum * 100)}%`, cx + cwi - 19, y + headH / 2 + 0.5, 10, C.ink3, 'right', 500);
      } else if (cwi > 40) moonGlyph(n, cx + cwi - 9, y + headH / 2, compact ? 4 : 5);
      // the night itself
      if (v) {
        drawNight(n, cx, bodyY, cwi, bodyH, 'v', { dim: dimmed, labels: expanded || (inFocus && cwi >= 60) });
        if (expanded) this.expandedDetails(n, cx, bodyY, cwi, bodyH);
      } else {
        const bh = expanded ? 64 : compact ? Math.max(10, b.h - headH - 8) : 22;
        drawNight(n, cx + 4, bodyY + 3, cwi - 8, bh, 'h', { dim: dimmed, curve: expanded, labels: expanded, labelY: bodyY + 3 + 10 });
        if (expanded) {
          const facts = nightFacts(n);
          facts.forEach((f, k) => text(f, cx + 5, bodyY + 128 + k * 16, 10.5, k === 0 ? C.ink2 : C.ink3, 'left', 500));
        }
      }
      // footer: moon-free hours + window
      if (!compact) {
        const fy = v ? y + b.h - g - footH / 2 : bodyY + (expanded ? 84 : 36);
        const mfTxt = n.mfMs ? fmtDur(n.mfMs) : (n.tdMs ? 'Moon all night' : 'No true dark');
        if (n.mfMs) { ctx.fillStyle = dimmed ? C.ink3 : C.good; ctx.fillRect(cx + 5, fy - 3.5, 7, 7); }
        text(mfTxt, cx + (n.mfMs ? 16 : 5), fy, v ? 11.5 : 13, n.mfMs ? (dimmed ? C.ink3 : C.ink) : C.ink3, 'left', 650);
        if (n.mfH.length) {
          const win = `${fmtClockS(n.mfH[0][0])}–${fmtClockS(n.mfH[n.mfH.length - 1][1])}`;
          if (v) { if (cwi > 118) text(win, cx + cwi - 5, fy, 10, C.ink3, 'right', 500); }
          else text(win, cx + 5, fy + 15, 10.5, C.ink3, 'left', 500);
        }
      }
      if (i === tonightIdx) { ctx.strokeStyle = C.now; ctx.lineWidth = 2; ctx.strokeRect(cx + 1, y + 1, cwi - 2, b.h - g - 2); }
      if (i === S.sel) { ctx.strokeStyle = C.select; ctx.lineWidth = 2.5; ctx.strokeRect(cx + 1.25, y + 1.25, cwi - 2.5, b.h - g - 2.5); }
      else if (S.hover && S.hover.i === i) { ctx.strokeStyle = C.hair2; ctx.lineWidth = 1.5; ctx.strokeRect(cx + 0.75, y + 0.75, cwi - 1.5, b.h - g - 1.5); }
    }
  },
  expandedDetails(n, cx, y, w, h) {
    // sunset / sunrise on the day color; moonrise / moonset only when inside the night and not already a window edge
    const span = ax.end - ax.start;
    const Y = hh => y + (hh - ax.start) / span * h;
    const dayInk = inkOn(C.day);
    if (n.evH.sunset != null) text(`sunset ${fmtClockS(n.evH.sunset)}`, cx + w / 2, Y(n.evH.sunset) - 7, 9.5, dayInk, 'center', 600);
    if (n.evH.sunrise != null) text(`sunrise ${fmtClockS(n.evH.sunrise)}`, cx + w / 2, Y(n.evH.sunrise) + 8, 9.5, dayInk, 'center', 600);
    const edges = n.mfH.flat();
    for (const [t, lab] of [[n.moonRise, 'moonrise'], [n.moonSet, 'moonset']]) {
      if (t == null || n.evH.sunset == null || n.evH.sunrise == null) continue;
      const hh = wallH(t, n);
      if (hh < n.evH.sunset || hh > n.evH.sunrise || edges.some(e => Math.abs(e - hh) < 0.1)) continue;
      ctx.fillStyle = `rgba(${C.moon},0.9)`; ctx.fillRect(cx, snap(Y(hh)), w, 1);
      text(`${lab} ${fmtClockS(hh)}`, cx + w / 2, Y(hh) + (lab === 'moonrise' ? -7 : 8), 9.5, inkOn(skyColorAt(n, hh)), 'center', 600);
    }
  },
  drawYear(st) {
    const { cw, ch } = this.yr;
    for (const b of this.blocks) {
      const y = b.y - st;
      if (y + b.h < 0 || y > H) continue;
      const mo = b.mo;
      text(`${MONL[mo.m - 1]} ${mo.y}`, b.x, y + 11, 13, C.ink, 'left', 700);
      text(`${Math.round(mo.total / MS_H)}h`, b.x + b.w - 2, y + 11, 11, C.ink3, 'right', 600);
      ctx.fillStyle = C.weekend;
      roundRect(b.x + 5 * cw - 2, y + 24, 2 * cw + 1, 20 + mo.weeks.length * ch, 5); ctx.fill();
      for (let d = 0; d < 7; d++) text(WD1[d], b.x + d * cw + cw / 2, y + 32, 9, d >= 5 ? C.ink2 : C.ink3, 'center', 600);
      mo.weeks.forEach((wk, wi) => {
        wk.forEach((i, d) => {
          if (i < 0) return;
          const n = nights[i];
          const cx = b.x + d * cw, cy = y + 42 + wi * ch;
          const dimmed = S.focus > 0 && Math.abs(n.nmOff) > S.focus;
          drawNight(n, cx, cy + 11, cw - 2, ch - 13, 'v', { mark: true, dim: dimmed });
          text(`${n.d}`, cx + 1, cy + 5, 8.5, (n.dow >= 5) ? C.ink : C.ink3, 'left', n.dow >= 5 ? 700 : 500);
          if (n.quarter === 0 || n.quarter === 2) moonGlyph(n, cx + cw - 7, cy + 5, 3.2);
          if (i === S.sel) { ctx.strokeStyle = C.select; ctx.lineWidth = 2; ctx.strokeRect(cx - 1, cy - 1, cw, ch); }
          if (i === tonightIdx) { ctx.strokeStyle = C.now; ctx.lineWidth = 1.5; ctx.strokeRect(cx - 0.5, cy + 10.5, cw - 1, ch - 12); }
        });
      });
    }
  },
  hit(px, py) {
    const st = scroller.scrollTop, cy = py + st;
    if (S.calZoom === 'year') {
      const { cw, ch } = this.yr;
      for (const b of this.blocks) {
        if (px < b.x || px > b.x + b.w || cy < b.y || cy > b.y + b.h) continue;
        const wi = Math.floor((cy - b.y - 42) / ch), d = Math.floor((px - b.x) / cw);
        if (wi < 0 || wi >= b.mo.weeks.length || d < 0 || d > 6) return null;
        const i = b.mo.weeks[wi][d];
        return i >= 0 ? { i } : null;
      }
      return null;
    }
    const { x0, cw } = this.cols();
    for (const b of this.blocks) {
      if (b.t !== 'week' || cy < b.y || cy >= b.y + b.h) continue;
      if (px >= this.PAD && px < this.PAD + this.GUT - 6) return { gutter: this.weekKey(b.mo, b.wi) };
      const d = Math.floor((px - x0) / cw);
      if (d < 0 || d > 6) return null;
      const i = b.wk[d];
      return i >= 0 ? { i } : null;
    }
    return null;
  },
};

// ---------- LUNATIONS: one row per lunar cycle, aligned on new moon
const Lun = {
  canvas: true, TOP: 30, LW: 132, RW: 132, PAD: 10,
  total: 0,
  geom() {
    const N = lunWindow(), cols = 2 * N + 1;
    const LW = W < 760 ? 80 : this.LW, RW = W < 760 ? 0 : this.RW;
    const cw = (W - this.PAD * 2 - LW - RW) / cols;
    const rh = cw >= 56 ? 150 : cw >= 36 ? 132 : 118;
    return { N, cols, LW, RW, cw, rh, x0: this.PAD + LW };
  },
  layout() {
    const { rh } = this.geom();
    this.total = this.TOP + lunations.length * (rh + 10) + 16;
  },
  topNight() {
    const { rh } = this.geom();
    const k = Math.max(0, Math.min(lunations.length - 1, Math.floor(scroller.scrollTop / (rh + 10))));
    return Math.max(0, lunations[k] ? lunations[k].i : 0);
  },
  scrollTo(i, top) {
    const { rh, N } = this.geom();
    let k = lunations.findIndex(L => i >= L.i - N && i <= L.i + N);
    if (k < 0) k = lunations.findIndex(L => L.i >= i);
    if (k < 0) return;
    const y = k * (rh + 10);
    const vis0 = scroller.scrollTop, vis1 = vis0 + H - this.TOP;
    if (top || y < vis0 || y + rh > vis1) scroller.scrollTop = Math.max(0, y - (top ? 0 : 40));
  },
  draw(st) {
    const { N, cols, LW, RW, cw, rh, x0 } = this.geom();
    ctx.save(); ctx.beginPath(); ctx.rect(0, this.TOP, W, H - this.TOP); ctx.clip();
    lunations.forEach((L, k) => {
      const y = this.TOP + k * (rh + 10) - st + 6;
      if (y + rh < this.TOP || y > H) return;
      // row header
      const nmWall = wallParts(L.t);
      const wd = WD3[new Date(Date.UTC(nmWall.y, nmWall.m - 1, nmWall.d)).getUTCDay()];
      text('New moon', this.PAD, y + 12, 10, C.ink3, 'left', 650);
      text(`${wd} ${MON3[nmWall.m - 1]} ${nmWall.d}`, this.PAD, y + 30, LW < 100 ? 12 : 15, C.ink, 'left', 700);
      const fi = Math.max(0, L.i - N), la = Math.min(nights.length - 1, L.i + N);
      text(`${MON3[nights[fi].m - 1]} ${nights[fi].d} – ${MON3[nights[la].m - 1]} ${nights[la].d}`, this.PAD, y + 48, 11, C.ink3, 'left', 500);
      if (LW >= 100) {
        ctx.fillStyle = C.good; ctx.fillRect(this.PAD, y + rh - 26, 7, 7);
        text(`${Math.round(L.total / MS_H)}h`, this.PAD + 12, y + rh - 22, 13, C.ink, 'left', 700);
        text(`moon-free in ±${N}`, this.PAD, y + rh - 8, 10, C.ink3, 'left', 500);
      }
      // cells
      const labH = 16, footH = cw >= 24 ? 16 : 0, g = cw >= 14 ? 2 : 1;
      for (let c = 0; c < cols; c++) {
        const off = c - N, i = L.i + off;
        const cx = x0 + c * cw;
        if (i < 0 || i >= nights.length) { ctx.fillStyle = C.chip; ctx.fillRect(cx, y + labH, cw - g, rh - labH - footH); continue; }
        const n = nights[i];
        const wk = n.dow === 5 || n.dow === 6;
        if (wk) { ctx.fillStyle = C.weekend; ctx.fillRect(cx, y, cw - g, labH); }
        const lab = cw >= 40 ? `${WD1[n.dow]} ${n.d === 1 ? MON3[n.m - 1] + ' 1' : n.d}` : `${n.d}`;
        text(lab, cx + (cw - g) / 2, y + labH / 2, cw >= 30 ? 10.5 : 9, wk ? C.ink : C.ink3, 'center', wk ? 700 : 500);
        drawNight(n, cx, y + labH, cw - g, rh - labH - footH, 'v', { labels: cw >= 58 });
        if (footH) text(n.mfMs ? fmtHrs(n.mfMs) : '—', cx + (cw - g) / 2, y + rh - footH / 2, cw >= 34 ? 10.5 : 9, n.mfMs ? C.ink2 : C.ink3, 'center', n.mfMs >= 4 * MS_H ? 650 : 500);
        if (off === 0) { ctx.fillStyle = C.ink; ctx.fillRect(cx, y + rh + 2, cw - g, 2); }
        if (i === tonightIdx) { ctx.strokeStyle = C.now; ctx.lineWidth = 2; ctx.strokeRect(cx + 1, y + labH + 1, cw - g - 2, rh - labH - footH - 2); }
        if (i === S.sel) { ctx.strokeStyle = C.select; ctx.lineWidth = 2.5; ctx.strokeRect(cx - 0.5, y - 0.5, cw - g + 1, rh + 1); }
        else if (S.hover && S.hover.i === i) { ctx.strokeStyle = C.hair2; ctx.lineWidth = 1.5; ctx.strokeRect(cx, y, cw - g, rh); }
      }
      // best weekend summary
      if (RW && L.best) {
        const rx = x0 + cols * cw + 12;
        const a = nights[L.best.i], b = nights[L.best.i + 1];
        text('Best weekend', rx, y + 12, 10, C.ink3, 'left', 650);
        text(`Fri–Sat ${MON3[a.m - 1]} ${a.d}–${b.m !== a.m ? MON3[b.m - 1] + ' ' : ''}${b.d}`, rx, y + 30, 12.5, C.ink, 'left', 650);
        ctx.fillStyle = C.good; ctx.fillRect(rx, y + 44, 7, 7);
        text(`${fmtDur(L.best.sum)}`, rx + 12, y + 48, 12.5, C.ink, 'left', 700);
        text('moon-free, both nights', rx, y + 64, 10, C.ink3, 'left', 500);
        // cells from the best weekend get a bracket
        const c0 = L.best.i - L.i + N;
        if (c0 >= 0 && c0 + 1 < cols) {
          ctx.fillStyle = C.select;
          ctx.fillRect(x0 + c0 * cw, y + rh + 6, cw * 2 - g, 2);
        }
      }
    });
    ctx.restore();
    // sticky header
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, this.TOP);
    ctx.fillStyle = C.hair; ctx.fillRect(0, this.TOP - 1, W, 1);
    text('Nights from new moon →', this.PAD, this.TOP / 2, 10, C.ink3, 'left', 600);
    for (let c = 0; c < cols; c++) {
      const off = c - N;
      if (cw < 22 && off % 2) continue;
      text(off === 0 ? 'New' : (off > 0 ? '+' : '−') + Math.abs(off), x0 + c * cw + (cw - 2) / 2, this.TOP / 2, 10.5, off === 0 ? C.ink : C.ink3, 'center', off === 0 ? 700 : 500);
    }
    if (RW) text('Trip pick', x0 + cols * cw + 12, this.TOP / 2, 10, C.ink3, 'left', 600);
  },
  hit(px, py) {
    if (py < this.TOP) return null;
    const { N, cols, cw, rh, x0 } = this.geom();
    const cy = py - this.TOP + scroller.scrollTop - 6;
    const k = Math.floor(cy / (rh + 10));
    if (k < 0 || k >= lunations.length || cy - k * (rh + 10) > rh) return null;
    const c = Math.floor((px - x0) / cw);
    if (c < 0 || c >= cols) return null;
    const i = lunations[k].i + c - N;
    return i >= 0 && i < nights.length ? { i } : null;
  },
};

const views = { river: River, calendar: Cal, lunations: Lun, table: { canvas: false }, notes: { canvas: false } };

// ---------- inspector
function phaseAt(n, hh) {
  const E = n.evH;
  const inside = (a, b) => a != null && b != null && hh >= a && hh < b;
  if (inside(E.astroDusk, E.astroDawn)) return 'True dark';
  if (inside(E.nauticalDusk, E.nauticalDawn)) return 'Astronomical twilight';
  if (inside(E.civilDusk, E.civilDawn)) return 'Nautical twilight';
  if (inside(E.sunset, E.sunrise)) return 'Civil twilight';
  return 'Day';
}
function moonAltAt(n, hh) {
  // hh is wall hours after noon; samples are uniform in real time
  const t = n.wallNoon + hh * MS_H;
  const real = t - offsetMin(t) * MS_M;
  const f = (real - n.S0) / STEP;
  if (f < 0 || f > NS - 1) return null;
  const i = Math.floor(f), r = f - i;
  return n.moonAlt[i] * (1 - r) + n.moonAlt[Math.min(NS - 1, i + 1)] * r;
}

function nightFacts(n) {
  const E = n.evH, out = [];
  out.push(n.tdH ? `Dark ${fmtClockS(n.tdH[0])}–${fmtClockS(n.tdH[1])}` : 'No true dark');
  const inNight = t => t != null && E.sunset != null && wallH(t, n) > E.sunset && wallH(t, n) < E.sunrise;
  const moon = [];
  if (inNight(n.moonRise)) moon.push(`rises ${fmtClockS(wallH(n.moonRise, n))}`);
  if (inNight(n.moonSet)) moon.push(`sets ${fmtClockS(wallH(n.moonSet, n))}`);
  out.push(`Moon ${Math.round(n.illum * 100)}% · ${moon.length ? moon.join(', ') : (n.moonUp.length && n.mfMs === 0 ? 'up all night' : 'down all night')}`);
  out.push(`Sun ${fmtClockS(E.sunset)} → ${fmtClockS(E.sunrise)}`);
  const tw = (a, b) => a != null && b != null ? Math.round((b - a) * 60) : null;
  const ev = tw(E.sunset, E.astroDusk), mo = tw(E.astroDawn, E.sunrise);
  if (ev != null && mo != null) out.push(`Twilight ${Math.floor(ev / 60)}h ${ev % 60}m / ${Math.floor(mo / 60)}h ${mo % 60}m`);
  return out;
}
function windowsText(n) {
  if (!n.tdH) return 'No astronomical darkness this night';
  if (!n.mfH.length) return `Moon up through all true dark (${fmtClock(n.tdH[0])} – ${fmtClock(n.tdH[1])})`;
  return n.mfH.map(([a, b]) => `${fmtClock(a)} – ${fmtClock(b)}`).join('  ·  ');
}

function inspect(i) {
  if (i < 0 || i >= nights.length) return;
  const n = nights[i];
  $('insDate').textContent = nightTitle(n);
  $('insSub').textContent = `Night ${n.id} · ${S.site.name}`;
  $('insBig').textContent = n.mfMs ? fmtDur(n.mfMs) : (n.tdMs ? '0m' : '—');
  $('insCap').textContent = (n.mfMs ? 'Moon-free true dark · ' : '') + windowsText(n) + (n.moonIgnored && n.tdMs ? ' (moon ignored: under threshold)' : '');
  $('insChart').innerHTML = altitudeChartSVG(n);
  // moon row
  const mr = n.moonRise != null ? fmtClock(wallH(n.moonRise, n)) : '—';
  const ms = n.moonSet != null ? fmtClock(wallH(n.moonSet, n)) : '—';
  const moonSvg = moonSVG(n.phase, 22);
  $('insMoon').innerHTML = `${moonSvg}<div><b>${Math.round(n.illum * 100)}% ${phaseName(n)}</b><br>Moonrise ${mr} · Moonset ${ms}</div>`;
  // stage durations
  const E = n.evH;
  const row = (label, sw, a, b, c, d) => {
    const cell = (s, e) => (s == null || e == null) ? '<div class="v">—</div>' : `<div class="v">${fmtClock(s).replace(' ', '&nbsp;')}<small>${fmtDur((e - s) * MS_H)}</small></div>`;
    return `<div class="k"><i class="sw" style="background:${sw}"></i>${label}</div>${cell(a, b)}${cell(c, d)}`;
  };
  let html = '<div class="h">Stage</div><div class="h v">Evening</div><div class="h v">Morning</div>';
  html += row('Civil twilight', 'var(--sky-civil)', E.sunset, E.civilDusk, E.civilDawn, E.sunrise);
  html += row('Nautical', 'var(--sky-naut)', E.civilDusk, E.nauticalDusk, E.nauticalDawn, E.civilDawn);
  html += row('Astronomical', 'var(--sky-astro)', E.nauticalDusk, E.astroDusk, E.astroDawn, E.nauticalDawn);
  html += `<div class="k"><i class="sw" style="background:var(--sky-dark)"></i>True dark</div><div class="v" style="grid-column: span 2">${n.tdH ? `${fmtClock(n.tdH[0])} – ${fmtClock(n.tdH[1])}<small>${fmtDur(n.tdMs)}</small>` : 'none'}</div>`;
  html += `<div class="k"><i class="sw line" style="background:var(--good)"></i>Moon-free</div><div class="v" style="grid-column: span 2">${n.mfMs ? fmtDur(n.mfMs) : 'none'}<small>${n.tdMs ? Math.round(100 * n.mfMs / n.tdMs) + '% of true dark' : ''}</small></div>`;
  html += `<div class="k">Sun</div><div class="v">Sets ${fmtClock(E.sunset)}</div><div class="v">Rises ${fmtClock(E.sunrise)}</div>`;
  $('insStages').innerHTML = html;
  const nm = n.nmOff === 0 ? 'New-moon night' : `${Math.abs(n.nmOff)} night${Math.abs(n.nmOff) === 1 ? '' : 's'} ${n.nmOff < 0 ? 'before' : 'after'} new moon`;
  $('insFoot').textContent = `${nm}${n.dst ? ' · Clocks change tonight' : ''} · Times are ${S.site.tz.replace('_', ' ')} clock time`;
  renderWeekends();
}

function weekendsAhead() {
  const out = [];
  const start = Math.max(0, tonightIdx);
  for (const L of lunations) {
    let best = null;
    for (let k = -7; k <= 7; k++) {
      const i = L.i + k;
      if (i < start || i + 1 >= nights.length || nights[i].dow !== 5) continue;
      const sum = nights[i].mfMs + nights[i + 1].mfMs;
      if (!best || sum > best.sum) best = { i, sum };
    }
    if (best) out.push(best);
  }
  return out.slice(0, 7);
}
function renderWeekends() {
  const list = weekendsAhead();
  const el = $('insWeekends');
  el.textContent = '';
  const max = Math.max(1, ...list.map(w => w.sum));
  for (const w of list) {
    const a = nights[w.i], b = nights[w.i + 1];
    const btn = document.createElement('button');
    if (S.sel === w.i || S.sel === w.i + 1) btn.className = 'on';
    const d = document.createElement('span');
    d.textContent = `Fri ${MON3[a.m - 1]} ${a.d} – Sat ${b.m !== a.m ? MON3[b.m - 1] + ' ' : ''}${b.d}`;
    const v = document.createElement('span');
    v.textContent = fmtDur(w.sum);
    v.style.fontWeight = '650';
    const m = document.createElement('span'); m.className = 'm';
    const f = document.createElement('i'); f.style.width = (100 * w.sum / max).toFixed(0) + '%'; m.appendChild(f);
    btn.append(d, v, m);
    btn.title = `${fmtDur(a.mfMs)} + ${fmtDur(b.mfMs)} moon-free`;
    btn.addEventListener('click', () => select(w.i, true));
    el.appendChild(btn);
  }
}

function moonSVG(phase, size) {
  const r = size / 2 - 1, c = size / 2;
  const k = Math.cos(phase * Math.PI / 180), waxing = phase < 180;
  const rx = Math.abs(k) * r;
  // lit region path: limb semicircle + terminator half-ellipse
  const top = `${c} ${c - r}`, bot = `${c} ${c + r}`;
  let d;
  if (waxing) d = `M ${top} A ${r} ${r} 0 0 1 ${bot} A ${rx} ${r} 0 0 ${k > 0 ? 0 : 1} ${top} Z`;
  else d = `M ${bot} A ${r} ${r} 0 0 1 ${top} A ${rx} ${r} 0 0 ${k > 0 ? 0 : 1} ${bot} Z`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${r}" fill="#2a3040" stroke="rgba(128,136,152,.6)"/><path d="${d}" fill="rgb(${C.moon})"/></svg>`;
}

// The existing single-night chart, redrawn for the inspector (x is elapsed time, as in the app)
function altitudeChartSVG(n) {
  const ev = n.ev;
  const g0 = ev.sunset != null ? ev.sunset : n.noon + 6 * MS_H;
  const g1 = ev.sunrise != null ? ev.sunrise : g0 + 13.2 * MS_H;
  const Wd = 340, Hd = 196, pl = 34, pr = 8, pt = 10, pb = 44;
  const pw = Wd - pl - pr, ph = Hd - pt - pb;
  const samples = [];
  for (let i = 0; i < NS; i++) {
    const t = n.S0 + i * STEP;
    if (t >= g0 - 12 * MS_M && t <= g1 + 12 * MS_M) samples.push([t, n.sunAlt[i], n.moonAlt[i]]);
  }
  const alts = samples.flatMap(p => [p[1], p[2]]);
  const lo = Math.min(-18, Math.floor((Math.min(...alts) - 4) / 5) * 5);
  const hi = Math.max(0, Math.ceil((Math.max(...alts) + 4) / 5) * 5);
  const X = t => pl + (Math.min(g1, Math.max(g0, t)) - g0) / (g1 - g0) * pw;
  const Y = a => pt + ph - (Math.min(hi, Math.max(lo, a)) - lo) / (hi - lo) * ph;
  const band = (a, b, color, op) => (a == null || b == null) ? '' : `<rect x="${X(a).toFixed(1)}" y="${pt}" width="${Math.max(0, X(b) - X(a)).toFixed(1)}" height="${ph}" fill="${color}" opacity="${op}"/>`;
  let s = `<svg class="ins-chart" viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="Sun and moon altitude through the night">`;
  s += `<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(47,189,120,0.14)"/><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(47,189,120,0.75)" stroke-width="1.2"/></pattern></defs>`;
  s += `<rect width="${Wd}" height="${Hd}" rx="10" fill="#0c111c"/>`;
  s += band(ev.sunset, ev.civilDusk, '#a0703f', 0.55) + band(ev.civilDawn, ev.sunrise, '#a0703f', 0.55);
  s += band(ev.civilDusk, ev.nauticalDusk, '#2f63b8', 0.5) + band(ev.nauticalDawn, ev.civilDawn, '#2f63b8', 0.5);
  s += band(ev.nauticalDusk, ev.astroDusk, '#3d3a9a', 0.55) + band(ev.astroDawn, ev.nauticalDawn, '#3d3a9a', 0.55);
  if (n.td) s += band(n.td[0], n.td[1], '#000000', 0.75);
  for (const [a, b] of n.mf) s += `<rect x="${X(a).toFixed(1)}" y="${pt}" width="${Math.max(0, X(b) - X(a)).toFixed(1)}" height="${ph}" fill="url(#hatch)"/>`;
  s += `<line x1="${pl}" x2="${pl + pw}" y1="${Y(0)}" y2="${Y(0)}" stroke="rgba(200,208,222,.55)"/>`;
  s += `<line x1="${pl}" x2="${pl + pw}" y1="${Y(-18)}" y2="${Y(-18)}" stroke="rgba(200,208,222,.45)" stroke-dasharray="5 4"/>`;
  const path = idx => samples.map((p, k) => `${k ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[idx]).toFixed(1)}`).join(' ');
  s += `<path d="${path(1)}" fill="none" stroke="#f3c64d" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<path d="${path(2)}" fill="none" stroke="#eef0f4" stroke-width="2" stroke-linejoin="round"/>`;
  const lab = (t, a) => `<text x="${pl - 5}" y="${Y(a) + 3}" font-size="9" fill="#9aa4b6" text-anchor="end">${t}</text>`;
  s += lab('0°', 0) + lab('−18°', -18) + lab(`${hi}°`, hi) + lab(`${lo}°`, lo);
  const evs = [['sunset', 1], ['civilDusk', 1], ['nauticalDusk', 1], ['astroDusk', 1], ['astroDawn', 0], ['nauticalDawn', 0], ['civilDawn', 0], ['sunrise', 0]];
  for (const [k, evening] of evs) {
    const t = ev[k];
    if (t == null || t < g0 - MS_M || t > g1 + MS_M) continue;
    const x = X(t);
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${pt}" y2="${pt + ph}" stroke="rgba(200,208,222,.28)"/>`;
    s += `<text transform="translate(${x.toFixed(1)} ${pt + ph + 7}) rotate(${evening ? 42 : -42})" font-size="8.5" font-weight="600" fill="#9aa4b6" text-anchor="${evening ? 'start' : 'end'}" dominant-baseline="middle">${fmtClock(wallH(t, n)).replace(' ', '')}</text>`;
  }
  if (tonightIdx >= 0 && nights[tonightIdx] === n) {
    const now = Date.now();
    if (now > g0 && now < g1) s += `<line x1="${X(now)}" x2="${X(now)}" y1="${pt}" y2="${pt + ph}" stroke="#2fbd78" stroke-width="2"/>`;
  }
  s += '</svg>';
  return s;
}

// ---------- tooltip
const tip = $('tip');
function showTip(i, hh, px, py) {
  const n = nights[i];
  tip.textContent = '';
  const add = (cls, s) => { const d = document.createElement('div'); d.className = cls; d.textContent = s; tip.appendChild(d); return d; };
  add('t1', nightTitle(n));
  add('t2', n.mfMs ? `${fmtDur(n.mfMs)} moon-free` : (n.tdMs ? 'No moon-free true dark' : 'No true dark'));
  add('t3', windowsText(n));
  add('t3', `Sunset ${fmtClock(n.evH.sunset)} · Sunrise ${fmtClock(n.evH.sunrise)}`);
  add('t3', `Moon ${Math.round(n.illum * 100)}% · rise ${n.moonRise != null ? fmtClock(wallH(n.moonRise, n)) : '—'} · set ${n.moonSet != null ? fmtClock(wallH(n.moonSet, n)) : '—'}`);
  if (hh != null) {
    const alt = moonAltAt(n, hh);
    const moon = alt == null ? '' : alt > 0 ? ` · moon up ${Math.round(alt)}°` : ' · moon down';
    add('t4', `At ${fmtClock(hh)}: ${phaseAt(n, hh)}${moon}`);
  }
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = px + 16, y = py + 14;
  if (x + r.width > window.innerWidth - 8) x = px - r.width - 16;
  if (y + r.height > window.innerHeight - 8) y = py - r.height - 12;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
function showNote(msg, px, py) {
  tip.textContent = msg; tip.hidden = false;
  tip.style.left = (px + 14) + 'px'; tip.style.top = (py + 12) + 'px';
}
function hideTip() { tip.hidden = true; }

// ---------- interaction
let dragMini = false;
cv.addEventListener('pointermove', e => {
  if (!ready) return;
  const v = views[S.view];
  const r = cv.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  if (dragMini && v === River) { River.miniScroll(py); return; }
  const h = v.hit(px, py);
  const prev = S.hover;
  S.hover = h && !h.mini ? h : null;
  cv.style.cursor = h && (h.i != null || h.gutter || h.mini) ? 'pointer' : 'default';
  if (h && h.i != null) showTip(h.i, h.hh, e.clientX, e.clientY);
  else if (h && h.gutter) showNote(S.expandedWeek === h.gutter ? 'Collapse this week' : 'Expand this week for times and moonrise/moonset', e.clientX, e.clientY);
  else hideTip();
  if (JSON.stringify(prev) !== JSON.stringify(S.hover)) draw();
});
cv.addEventListener('pointerleave', () => { S.hover = null; hideTip(); draw(); });
cv.addEventListener('pointerdown', e => {
  if (!ready) return;
  const v = views[S.view];
  const r = cv.getBoundingClientRect();
  const h = v.hit(e.clientX - r.left, e.clientY - r.top);
  if (!h) return;
  if (h.mini) { dragMini = true; cv.setPointerCapture(e.pointerId); River.miniScroll(e.clientY - r.top); return; }
  if (h.gutter) {
    S.expandedWeek = S.expandedWeek === h.gutter ? null : h.gutter;
    relayout(); return;
  }
  if (h.i != null) select(h.i, false);
});
cv.addEventListener('pointerup', () => { dragMini = false; });
cv.addEventListener('dblclick', e => {
  if (S.view !== 'calendar' || S.calZoom !== 'year') return;
  const r = cv.getBoundingClientRect();
  const h = Cal.hit(e.clientX - r.left, e.clientY - r.top);
  if (h && h.i != null) { setOpt('calZoom', 'month'); select(h.i, true, true); }
});
window.addEventListener('keydown', e => {
  if (!ready || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  if (step && views[S.view].canvas) {
    e.preventDefault();
    select(Math.max(0, Math.min(nights.length - 1, (S.sel < 0 ? tonightIdx : S.sel) + step)), true);
  } else if (e.key === 't' || e.key === 'T') { goTonight(); }
  else if (e.key >= '1' && e.key <= '5') { setView(['calendar', 'river', 'lunations', 'table', 'notes'][+e.key - 1]); }
  else if (e.key === 'Escape') { S.expandedWeek = null; relayout(); }
});

function select(i, scroll, top) {
  S.sel = i;
  inspect(i);
  const v = views[S.view];
  if (scroll && v.canvas) v.scrollTo(i, !!top);
  if (S.view === 'table') renderTable();
  draw();
}
function goTonight() {
  const i = tonightIdx >= 0 ? tonightIdx : 0;
  S.sel = i; inspect(i);
  const v = views[S.view];
  if (v.canvas) { v.scrollTo(i, true); if (v === River) scroller.scrollTop = Math.max(0, River.ys[i] - 3 * River.hs[i]); }
  if (S.view === 'table') renderTable();
  draw();
}

// period label + month stepping follow the scroll position
function currentMonthIndex() {
  const v = views[S.view];
  let i = S.view === 'table' ? (S.sel >= 0 ? S.sel : tonightIdx) : (v.topNight ? v.topNight() : 0);
  if (S.view === 'river') i = Math.max(0, River.rowAt(scroller.scrollTop + 4 * (River.hs[0] || 1)));
  const n = nights[Math.max(0, i)];
  return months.findIndex(mo => mo.y === n.y && mo.m === n.m);
}
function updatePeriod() {
  if (!ready) return;
  if (S.view === 'lunations') {
    const i = Lun.topNight(); const n = nights[i];
    $('periodLabel').textContent = n ? `${MON3[n.m - 1]} ${n.y}` : '—';
    return;
  }
  const k = currentMonthIndex();
  const mo = months[k];
  $('periodLabel').textContent = mo ? `${MONL[mo.m - 1]} ${mo.y}` : '—';
}
function stepMonth(dir) {
  if (!ready) return;
  if (S.view === 'lunations') {
    const { rh } = Lun.geom();
    scroller.scrollTop = Math.max(0, scroller.scrollTop + dir * (rh + 10));
    return;
  }
  const k = Math.max(0, Math.min(months.length - 1, currentMonthIndex() + dir));
  const i = months[k].idx[0];
  if (S.view === 'table') { S.sel = i; inspect(i); renderTable(); return; }
  const v = views[S.view];
  if (v === River) scroller.scrollTop = River.ys[i];
  else v.scrollTo(i, true);
  draw();
}

// ---------- table view (the plain-data twin)
function renderTable() {
  const k = Math.max(0, currentMonthIndex());
  const mo = months[k];
  const el = $('tableView');
  const rows = mo.idx.map(i => {
    const n = nights[i], E = n.evH;
    const wk = n.dow === 5 || n.dow === 6;
    return `<tr data-i="${i}" class="${wk ? 'wk' : ''} ${i === S.sel ? 'sel' : ''}"><td>${WD3[n.dow]} ${MON3[n.m - 1]} ${n.d}</td><td>${fmtClock(E.sunset)}</td><td>${fmtClock(E.astroDusk)}</td><td>${fmtClock(E.astroDawn)}</td><td>${fmtClock(E.sunrise)}</td><td>${Math.round(n.illum * 100)}%</td><td>${n.moonRise != null ? fmtClock(wallH(n.moonRise, n)) : '—'}</td><td>${n.moonSet != null ? fmtClock(wallH(n.moonSet, n)) : '—'}</td><td>${n.tdMs ? fmtDur(n.tdMs) : '—'}</td><td class="mf">${n.mfMs ? fmtDur(n.mfMs) : '—'}</td><td>${n.mfH.length ? n.mfH.map(([a, b]) => `${fmtClockS(a)}–${fmtClockS(b)}`).join(', ') : '—'}</td></tr>`;
  }).join('');
  el.innerHTML = `<table class="nt"><thead><tr><th>${MONL[mo.m - 1]} ${mo.y}</th><th>Sunset</th><th>Astro dusk</th><th>Astro dawn</th><th>Sunrise</th><th>Moon</th><th>Moonrise</th><th>Moonset</th><th>True dark</th><th>Moon-free</th><th>Window</th></tr></thead><tbody>${rows}</tbody></table>`;
  $('periodLabel').textContent = `${MONL[mo.m - 1]} ${mo.y}`;
}
$('tableView').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-i]');
  if (tr) select(+tr.dataset.i, false);
});

// ---------- view switching + controls
const VIEW_INFO = {
  calendar: ['Calendar', 'Each day cell holds that evening’s night; time runs down each cell.'],
  river: ['River', 'One row per night, clock time across — the moon’s diagonal and the seasons show as shapes.'],
  lunations: ['Lunations', 'One row per lunar cycle, aligned on new moon; weekends tinted.'],
  table: ['Table', 'The same numbers as a plain table, one month at a time.'],
  notes: ['Notes', 'What each approach is for, and which one I would build.'],
};
function viewControls() {
  const el = $('viewCtl');
  el.textContent = '';
  const seg = (key, opts) => {
    const s = document.createElement('span'); s.className = 'seg small';
    for (const [val, label] of opts) {
      const b = document.createElement('button'); b.textContent = label; b.dataset.val = val;
      b.setAttribute('aria-pressed', String(S[key] === val));
      b.addEventListener('click', () => { setOpt(key, val); viewControls(); });
      s.appendChild(b);
    }
    el.appendChild(s);
    el.appendChild(document.createTextNode(' '));
  };
  if (S.view === 'river') { seg('riverZoom', [['year', 'Year'], ['month', 'Month'], ['week', 'Week']]); seg('riverMark', [['line', 'Green edge'], ['none', 'Black only']]); }
  if (S.view === 'calendar') { seg('calZoom', [['month', 'Month'], ['year', 'Year']]); if (S.calZoom === 'month') seg('calOrient', [['v', 'Time ↓'], ['h', 'Time →']]); }
}
function setOpt(key, val) {
  const keep = S.sel >= 0 ? S.sel : null;
  S[key] = val; store.set(key, val);
  if (key === 'calZoom' || key === 'calOrient') S.expandedWeek = null;
  relayout(keep);
  if (keep == null) draw();
}
function setView(view) {
  const keep = S.sel >= 0 ? S.sel : tonightIdx;
  S.view = view; store.set('view', view); S.hover = null; hideTip();
  for (const b of $('viewSeg').children) b.setAttribute('aria-pressed', String(b.dataset.view === view));
  const v = views[view];
  $('scroller').hidden = !v.canvas;
  $('tableView').hidden = view !== 'table';
  $('notesView').hidden = view !== 'notes';
  $('legend').style.display = view === 'notes' || view === 'table' ? 'none' : '';
  document.querySelector('.period').style.visibility = view === 'notes' ? 'hidden' : '';
  $('viewTitle').textContent = VIEW_INFO[view][0];
  $('viewSub').textContent = VIEW_INFO[view][1];
  viewControls();
  if (!ready) return;
  if (v.canvas) { resize(); if (keep != null && keep >= 0) v.scrollTo(keep, true); draw(); }
  if (view === 'table') renderTable();
}
$('viewSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });
$('focusSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.focus = +b.dataset.val; store.set('focus', S.focus);
  for (const x of $('focusSeg').children) x.setAttribute('aria-pressed', String(+x.dataset.val === S.focus));
  if (ready) { for (const L of lunations) bestWeekend(L); relayout(S.sel >= 0 ? S.sel : tonightIdx); }
});
$('moonAltSel').addEventListener('change', e => { S.moonAlt = +e.target.value; store.set('moonAlt', S.moonAlt); if (ready) { deriveAll(); inspect(S.sel); relayout(); } });
$('crescentSel').addEventListener('change', e => { S.crescent = +e.target.value; store.set('crescent', S.crescent); if (ready) { deriveAll(); inspect(S.sel); relayout(); } });
$('prevBtn').addEventListener('click', () => stepMonth(-1));
$('nextBtn').addEventListener('click', () => stepMonth(1));
$('todayBtn').addEventListener('click', goTonight);
$('insPrev').addEventListener('click', () => select(Math.max(0, S.sel - 1), true));
$('insNext').addEventListener('click', () => select(Math.min(nights.length - 1, S.sel + 1), true));
$('rangePrev').addEventListener('click', () => { S.rangeShift--; restart(); });
$('rangeNext').addEventListener('click', () => { S.rangeShift++; restart(); });

// site editor
function siteLabel() {
  const s = S.site;
  $('siteBtn').textContent = `${s.name} · ${Math.abs(s.lat).toFixed(2)}°${s.lat >= 0 ? 'N' : 'S'} ${Math.abs(s.lon).toFixed(2)}°${s.lon >= 0 ? 'E' : 'W'} ▾`;
}
$('siteBtn').addEventListener('click', () => {
  const p = $('sitePop');
  p.hidden = !p.hidden;
  if (!p.hidden) { $('siteName').value = S.site.name; $('siteLat').value = S.site.lat; $('siteLon').value = S.site.lon; $('siteTz').value = S.site.tz; $('siteErr').hidden = true; $('siteName').focus(); }
});
$('siteCancel').addEventListener('click', () => { $('sitePop').hidden = true; });
$('siteReset').addEventListener('click', () => { applySite({ ...DEFAULT_SITE }); });
$('siteApply').addEventListener('click', () => {
  const lat = parseFloat($('siteLat').value), lon = parseFloat($('siteLon').value), tz = $('siteTz').value.trim();
  const err = $('siteErr');
  if (!(lat >= -65 && lat <= 65)) { err.textContent = 'Latitude must be between −65° and 65° for this planner.'; err.hidden = false; return; }
  if (!(lon >= -180 && lon <= 180)) { err.textContent = 'Longitude must be between −180° and 180°.'; err.hidden = false; return; }
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch (e2) { err.textContent = `“${tz}” is not a time zone name. Try America/Los_Angeles.`; err.hidden = false; return; }
  applySite({ name: $('siteName').value.trim() || 'Custom site', lat, lon, tz });
});
function applySite(site) {
  S.site = site; store.set('site', site); $('sitePop').hidden = true; siteLabel(); restart();
}

function restart() {
  const selId = S.sel >= 0 && nights[S.sel] ? nights[S.sel].id : null;
  computeAll(() => {
    const r = rangeMonths();
    $('rangeLabel').textContent = `${MON3[r.m - 1]} ${r.y} – ${MON3[nights[nights.length - 1].m - 1]} ${nights[nights.length - 1].y}`;
    let i = selId ? nights.findIndex(n => n.id === selId) : -1;
    if (i < 0) i = tonightIdx >= 0 ? tonightIdx : 0;
    S.sel = i;
    inspect(i);
    setView(S.view);
    const v = views[S.view];
    if (v.canvas) {
      if (v === River) scroller.scrollTop = Math.max(0, River.ys[i] - 3 * River.hs[i]);
      else v.scrollTo(i, true);
    }
    draw();
    window.dispatchEvent(new Event('npa-ready'));
  });
}

// theme changes re-read tokens
function onTheme() { readColors(); if (ready) { inspect(S.sel); draw(); } }
try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme); } catch (e) { /* old engines */ }
new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
new ResizeObserver(() => { if (views[S.view].canvas) resize(); }).observe(scroller);
scroller.addEventListener('scroll', draw, { passive: true });

// ---------- boot
function boot() {
  if (!A) { $('loadingText').textContent = 'The astronomy library did not load. Check the network and reload.'; return; }
  readColors();
  siteLabel();
  for (const x of $('focusSeg').children) x.setAttribute('aria-pressed', String(+x.dataset.val === S.focus));
  $('moonAltSel').value = String(S.moonAlt);
  $('crescentSel').value = String(S.crescent);
  for (const b of $('viewSeg').children) b.setAttribute('aria-pressed', String(b.dataset.view === S.view));
  $('notesView').innerHTML = document.getElementById('notesTpl').innerHTML;
  restart();
}
window.__npa = { S, select, setView, setOpt, relayout, draw, goTonight, get nights() { return nights; }, get ax() { return ax; }, get lunations() { return lunations; } };
boot();
})();
