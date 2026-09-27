import { el } from '../ui/dom';

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif';

export const cv = el<HTMLCanvasElement>('cv');
const context = cv.getContext('2d');
if (!context) throw new Error('This browser has no 2D canvas');
/** The one drawing context every view paints into. */
export const ctx: CanvasRenderingContext2D = context;

/** Canvas size in CSS pixels and the device pixel ratio. */
export const size = { W: 0, H: 0, dpr: 1 };

/** Round to the nearest device pixel so fills stay crisp. */
export const snap = (v: number): number => Math.round(v * size.dpr) / size.dpr;

export function sizeSurface(W: number, H: number, dpr: number): void {
  size.W = W;
  size.H = H;
  size.dpr = dpr;
  cv.width = Math.max(1, Math.round(W * dpr));
  cv.height = Math.max(1, Math.round(H * dpr));
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
}

export function font(px: number, weight = 500): string {
  return `${weight} ${px}px ${FONT}`;
}

export function text(
  s: string,
  x: number,
  y: number,
  px: number,
  color: string,
  align: CanvasTextAlign = 'left',
  weight = 500,
  base: CanvasTextBaseline = 'middle',
): void {
  ctx.font = font(px, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s, x, y);
}

/** Width of `s` at the given size and weight. */
export function tw(s: string, px: number, weight = 500): number {
  ctx.font = font(px, weight);
  return ctx.measureText(s).width;
}

export function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export function chevron(cx: number, cy: number, open: boolean, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (open) {
    ctx.moveTo(cx - 4, cy - 2);
    ctx.lineTo(cx, cy + 2);
    ctx.lineTo(cx + 4, cy - 2);
  } else {
    ctx.moveTo(cx - 2, cy - 4);
    ctx.lineTo(cx + 2, cy);
    ctx.lineTo(cx - 2, cy + 4);
  }
  ctx.stroke();
}
