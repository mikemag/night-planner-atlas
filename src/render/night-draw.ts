import { atlas } from '../app/state';
import { fmtClockS } from '../model/format';
import { NS, STEP, wallH, type Night } from '../model/night';
import { C, inkOn, moonAlpha } from './colors';
import { ctx, snap, text } from './surface';

export interface NightDrawOptions {
  /** Mark moon-free true dark with the green edge (default on). */
  mark?: boolean;
  /** Label moon-free windows with their start and end times where they fit. */
  labels?: boolean;
  /** Draw the moon's altitude track (time across only). */
  curve?: boolean;
  /** Baseline for window labels when time runs across. */
  labelY?: number | null;
  dim?: boolean;
}

/**
 * Draw one night into a rectangle. With `o = 'h'` clock time runs left to right; with
 * `o = 'v'` it runs top to bottom. Every view uses this, so a night looks the same everywhere.
 */
export function drawNight(
  n: Night,
  x: number,
  y: number,
  w: number,
  h: number,
  o: 'h' | 'v',
  opt: NightDrawOptions = {},
): void {
  const { ax } = atlas();
  const L = o === 'h' ? w : h;
  const span = ax.end - ax.start;
  const P = (t: number) => snap(((t - ax.start) / span) * L);
  const seg = (a: number, b: number, color: string) => {
    let p0 = P(a),
      p1 = P(b);
    if (p0 < 0) p0 = 0;
    if (p1 > L) p1 = L;
    if (!(p1 > p0)) return;
    ctx.fillStyle = color;
    if (o === 'h') ctx.fillRect(x + p0, y, p1 - p0, h);
    else ctx.fillRect(x, y + p0, w, p1 - p0);
  };
  const E = n.evH;
  ctx.globalAlpha = opt.dim ? 0.35 : 1;
  seg(ax.start, ax.end, C.day);
  if (E.sunset != null && E.sunrise != null) seg(E.sunset, E.sunrise, C.civil);
  if (E.civilDusk != null && E.civilDawn != null) seg(E.civilDusk, E.civilDawn, C.naut);
  if (E.nauticalDusk != null && E.nauticalDawn != null)
    seg(E.nauticalDusk, E.nauticalDawn, C.astro);
  if (n.tdH) seg(n.tdH[0], n.tdH[1], C.dark);
  if (n.tdH) {
    const col = `rgba(${C.moon},${moonAlpha(n.illum).toFixed(3)})`;
    for (const [a, b] of n.moonUpH) {
      const s = Math.max(a, n.tdH[0]),
        e = Math.min(b, n.tdH[1]);
      if (e > s) seg(s, e, col);
    }
  }
  if (opt.mark !== false && n.mfH.length && (o === 'h' ? h >= 5 : w >= 5)) {
    ctx.fillStyle = C.good;
    const th =
      o === 'h' ? Math.max(1.5, Math.min(2, h * 0.12)) : Math.max(1.5, Math.min(2, w * 0.06));
    for (const [a, b] of n.mfH) {
      let p0 = P(a),
        p1 = P(b);
      if (p0 < 0) p0 = 0;
      if (p1 > L) p1 = L;
      if (!(p1 > p0)) continue;
      if (o === 'h') ctx.fillRect(x + p0, y + h - th, p1 - p0, th);
      else ctx.fillRect(x, y + p0, th, p1 - p0);
    }
  }
  if (opt.curve && o === 'h') {
    const aMin = -25,
      aMax = 65;
    const Y = (alt: number) => y + h * (1 - (alt - aMin) / (aMax - aMin));
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, snap(Y(0)) + 0.5);
    ctx.lineTo(x + w, snap(Y(0)) + 0.5);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = `rgba(${C.moon},0.95)`;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let prev = -1e9;
    for (let i = 0; i < NS; i++) {
      const hh = wallH(n.S0 + i * STEP, n);
      const px = x + ((hh - ax.start) / span) * w,
        py = Y(n.moonAlt[i]);
      // break the path where the clock jumps back (fall-back night)
      if (i === 0 || hh < prev) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      prev = hh;
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  if (opt.labels && n.mfH.length) {
    for (const [a, b] of n.mfH) {
      const p0 = Math.max(0, P(a)),
        p1 = Math.min(L, P(b));
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

/** The sky color drawn at `hh` wall-clock hours after noon (ignoring moonlight). */
export function skyColorAt(n: Night, hh: number): string {
  const E = n.evH;
  const inside = (a: number | null, b: number | null) =>
    a != null && b != null && hh >= a && hh < b;
  if (n.tdH && hh >= n.tdH[0] && hh < n.tdH[1]) return C.dark;
  if (inside(E.nauticalDusk, E.nauticalDawn)) return C.astro;
  if (inside(E.civilDusk, E.civilDawn)) return C.naut;
  if (inside(E.sunset, E.sunrise)) return C.civil;
  return C.day;
}

/**
 * Sunset and sunrise labels on the day color, plus moonrise and moonset when they fall inside
 * the night and aren't already a window edge. Time runs across.
 */
export function eventLabelsH(
  n: Night,
  x: number,
  y: number,
  w: number,
  h: number,
  horizonY: number,
): void {
  const { ax } = atlas();
  const span = ax.end - ax.start;
  const X = (hh: number) => x + ((hh - ax.start) / span) * w;
  const dayInk = inkOn(C.day),
    cy = y + h - 10;
  const E = n.evH;
  if (E.sunset != null)
    text(`sunset ${fmtClockS(E.sunset)}`, X(E.sunset) - 5, cy, 10, dayInk, 'right', 600);
  if (E.sunrise != null)
    text(`sunrise ${fmtClockS(E.sunrise)}`, X(E.sunrise) + 5, cy, 10, dayInk, 'left', 600);
  const edges = n.mfH.flat();
  const moonEvents: Array<[number | null, 'moonrise' | 'moonset']> = [
    [n.moonRise, 'moonrise'],
    [n.moonSet, 'moonset'],
  ];
  for (const [t, lab] of moonEvents) {
    if (t == null || E.sunset == null || E.sunrise == null) continue;
    const hh = wallH(t, n);
    if (hh < E.sunset || hh > E.sunrise || edges.some((e) => Math.abs(e - hh) < 0.1)) continue;
    const mx = X(hh);
    ctx.fillStyle = `rgb(${C.moon})`;
    ctx.beginPath();
    ctx.arc(mx, horizonY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    const rise = lab === 'moonrise';
    text(
      `${lab} ${fmtClockS(hh)}`,
      mx + (rise ? -6 : 6),
      horizonY - 8,
      10,
      inkOn(skyColorAt(n, hh)),
      rise ? 'right' : 'left',
      600,
    );
  }
}

/** A moon at `phase` degrees (0 new, 180 full), lit side on the right while waxing. */
export function drawMoonGlyph(
  cx: number,
  cy: number,
  r: number,
  phase: number,
  litColor: string,
  darkColor: string,
  ring?: string,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = darkColor;
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const k = Math.cos((phase * Math.PI) / 180);
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
  ctx.fillStyle = litColor;
  ctx.fill();
}

export function moonGlyph(n: Night, cx: number, cy: number, r: number): void {
  drawMoonGlyph(cx, cy, r, n.phase, `rgb(${C.moon})`, '#2a3040', 'rgba(128,136,152,0.55)');
}

export interface HourTick {
  hh: number;
  major: boolean;
  midnight: boolean;
  label: string;
}

/** Whole-hour ticks along the axis; labels thin out as hours get narrower. */
export function hourTicks(pxPerHour: number): HourTick[] {
  const { ax } = atlas();
  const every = pxPerHour >= 46 ? 1 : pxPerHour >= 24 ? 2 : 3;
  const out: HourTick[] = [];
  for (let hh = Math.ceil(ax.start); hh <= Math.floor(ax.end); hh++) {
    const clock = (((12 + hh) % 24) + 24) % 24;
    out.push({
      hh,
      major: clock % every === 0,
      midnight: clock === 0,
      label: clock === 0 ? '12a' : clock === 12 ? '12p' : `${clock % 12}${clock < 12 ? 'a' : 'p'}`,
    });
  }
  return out;
}
