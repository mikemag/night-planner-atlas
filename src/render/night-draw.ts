import { atlas } from '../app/state';
import type { Axis } from '../model/range';
import { fmtClockS } from '../model/format';
import { STEP, sunBandAt, wallH, type Night } from '../model/night';
import { C } from './colors';
import { moonlightBands, moonlightStops } from './moonlight';
import { ctx, snap, text, tw } from './surface';

export interface NightDrawOptions {
  /** Calendar Week fits all seven nights on one sunset-to-sunrise clock. */
  axis?: Axis;
  /** Label moon-free windows with their start and end times where they fit. */
  labels?: boolean;
  /** Draw the moon's altitude track (time across only). */
  curve?: boolean;
  /** Baseline for window labels when time runs across. */
  labelY?: number | null;
  /** Quieter window labels on ordinary River weekdays. */
  labelWeight?: number;
  /** Font size for horizontal window labels; fit uses the same measured size. */
  labelSize?: number;
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
  const ax = opt.axis ?? atlas().ax;
  const L = o === 'h' ? w : h;
  const span = ax.end - ax.start;
  const P = (t: number) => snap(((t - ax.start) / span) * L);
  const seg = (a: number, b: number, color: string | CanvasGradient) => {
    let p0 = P(a),
      p1 = P(b);
    if (p0 < 0) p0 = 0;
    if (p1 > L) p1 = L;
    if (!(p1 > p0)) return;
    ctx.fillStyle = color;
    if (o === 'h') ctx.fillRect(x + p0, y, p1 - p0, h);
    else ctx.fillRect(x, y + p0, w, p1 - p0);
  };
  ctx.globalAlpha = opt.dim ? 0.35 : 1;
  seg(ax.start, ax.end, C.day);
  for (const [band, color] of [
    ['sun', C.civil],
    ['civil', C.naut],
    ['nautical', C.astro],
    ['astronomical', C.dark],
  ] as const)
    for (const [a, b] of n.sunBelow[band]) seg(wallH(a, n), wallH(b, n), color);
  const bands = moonlightBands(n);
  const wash = (a: number, b: number, rgb: string) => {
    const start = wallH(a, n),
      end = wallH(b, n);
    if (end <= start || P(end) <= 0 || P(start) >= L) return;
    const gradient =
      o === 'h'
        ? ctx.createLinearGradient(x + P(start), y, x + P(end), y)
        : ctx.createLinearGradient(x, y + P(start), x, y + P(end));
    for (const { offset, opacity } of moonlightStops(n, [a, b]))
      gradient.addColorStop(offset, `rgba(${rgb},${opacity})`);
    seg(start, end, gradient);
  };
  if (bands.ordinary.length) {
    for (const [a, b] of bands.ordinary) wash(a, b, C.moon);
  }
  if (bands.accepted.length) {
    for (const [a, b] of bands.accepted) {
      const start = wallH(a, n),
        end = wallH(b, n);
      wash(a, b, C.acceptedMoon);
      if (C.acceptedEdge !== 'transparent') {
        const p0 = Math.max(0, P(start)),
          p1 = Math.min(L, P(end));
        if (p1 <= p0) continue;
        ctx.save();
        ctx.strokeStyle = C.acceptedEdge;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        if (o === 'h')
          ctx.strokeRect(x + p0 + 0.5, y + 0.5, Math.max(0, p1 - p0 - 1), Math.max(0, h - 1));
        else ctx.strokeRect(x + 0.5, y + p0 + 0.5, Math.max(0, w - 1), Math.max(0, p1 - p0 - 1));
        ctx.restore();
      }
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
    for (let i = 0; i < n.moonAlt.length; i++) {
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
    const weight = opt.labelWeight ?? 600;
    const px = opt.labelSize ?? 10.5;
    for (const [a, b] of n.mfH) {
      const p0 = Math.max(0, P(a)),
        p1 = Math.min(L, P(b));
      if (o === 'h') {
        if (p1 - p0 < tw(fmtClockS(a), px, weight) + tw(fmtClockS(b), px, weight) + 18) continue;
        const cy = opt.labelY != null ? opt.labelY : y + h / 2 - 1;
        text(fmtClockS(a), x + p0 + 5, cy, px, '#ffffff', 'left', weight);
        text(fmtClockS(b), x + p1 - 5, cy, px, '#ffffff', 'right', weight);
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
  return { day: C.day, sun: C.civil, civil: C.naut, nautical: C.astro, astronomical: C.dark }[
    sunBandAt(n, hh)
  ];
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
export function hourTicks(pxPerHour: number, ax = atlas().ax): HourTick[] {
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
