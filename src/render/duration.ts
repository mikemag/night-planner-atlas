import { MS_H } from '../model/time';
import { C } from './colors';
import { ctx } from './surface';

/** The same legible, even-hour scale for Calendar and Lunations profiles. */
export const usableHoursScale = (maxMs: number): number =>
  Math.max(2, Math.ceil(maxMs / MS_H / 2) * 2);

/** Usable duration uses one color and a visible positive minimum in every view. */
export function drawDurationBar(
  value: number,
  max: number,
  x: number,
  y: number,
  w: number,
  h: number,
  orientation: 'h' | 'v' = 'h',
  opacity = 1,
): void {
  if (value <= 0 || max <= 0 || w <= 0 || h <= 0) return;
  const ratio = Math.min(1, value / max),
    alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * opacity;
  ctx.fillStyle = C.good;
  if (orientation === 'h') ctx.fillRect(x, y, Math.min(w, Math.max(1, w * ratio)), h);
  else {
    const height = Math.min(h, Math.max(1, h * ratio));
    ctx.fillRect(x, y + h - height, w, height);
  }
  ctx.globalAlpha = alpha;
}
