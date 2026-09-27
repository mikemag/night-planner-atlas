import { S, atlas } from '../app/state';
import { MON3, MONL, WD3, fmtClock, fmtHrs } from '../model/format';
import { wallH } from '../model/night';
import { C, inkOn } from '../render/colors';
import { drawNight, eventLabelsH, hourTicks, moonGlyph } from '../render/night-draw';
import { ctx, roundRect, size, snap, text, tw } from '../render/surface';
import { scroller } from '../ui/dom';
import type { CanvasView, Hit } from './view';

/** One row per night, stacked by date, with clock time running left to right. */
class RiverView implements CanvasView {
  /** Axis band, left gutter, moon column, right gutter and minimap widths. */
  AX = 30;
  GL = 70;
  GM = 22;
  GR = 92;
  MINI = 0;
  /** Row heights and tops (content coordinates below the axis band). */
  hs = new Float64Array(0);
  ys = new Float64Array(0);
  total = 0;

  geom() {
    const { W } = size;
    this.MINI = S.riverZoom === 'year' || W < 700 ? 0 : 58;
    this.GR = W < 700 ? 56 : 92;
    this.GL = W < 700 ? 52 : 70;
    const x0 = this.GL + this.GM,
      x1 = W - this.GR - this.MINI;
    return { x0, x1, cw: Math.max(40, x1 - x0) };
  }

  /** Row heights: the zoom sets them, and new-moon focus splits them into focus and context. */
  heights() {
    const N = atlas().nights.length;
    const avail = size.H - this.AX - 10;
    const z = S.riverZoom;
    if (z === 'year') {
      const b = Math.max(1, avail / N);
      return { base: b, fH: b, cH: b };
    }
    if (z === 'month') return { base: 20, fH: 34, cH: 8 };
    return { base: 74, fH: 74, cH: 14 };
  }

  layout(): void {
    const { nights } = atlas();
    const N = nights.length;
    this.hs = new Float64Array(N);
    this.ys = new Float64Array(N + 1);
    const { base, fH, cH } = this.heights();
    let y = 0;
    for (let i = 0; i < N; i++) {
      let h = base;
      if (S.focus > 0 && S.riverZoom !== 'year') h = Math.abs(nights[i].nmOff) <= S.focus ? fH : cH;
      this.ys[i] = y;
      this.hs[i] = h;
      y += h;
    }
    this.ys[N] = y;
    this.total = this.AX + y + 12;
  }

  /** The row at content height `cy`, or −1. */
  rowAt(cy: number): number {
    const N = atlas().nights.length;
    if (this.ys.length !== N + 1 || cy < 0) return -1;
    if (cy >= this.ys[N]) return -1;
    let lo = 0,
      hi = N - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.ys[mid] <= cy) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  topNight(): number {
    return Math.max(0, this.rowAt(scroller.scrollTop));
  }

  scrollTo(i: number, top: boolean): void {
    const y = this.ys[i];
    const vis0 = scroller.scrollTop,
      vis1 = vis0 + size.H - this.AX;
    if (top || y < vis0 || y + this.hs[i] > vis1)
      scroller.scrollTop = Math.max(0, y - (top ? 0 : (size.H - this.AX) * 0.3));
  }

  draw(st: number): void {
    const { nights, ax, maxMF, tonightIdx } = atlas();
    const { W, H } = size;
    const { x0, x1, cw } = this.geom();
    const top = this.AX,
      N = nights.length;
    const span = ax.end - ax.start;
    const X = (hh: number) => x0 + ((hh - ax.start) / span) * cw;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W - this.MINI, H - top);
    ctx.clip();
    const i0 = Math.max(0, this.rowAt(st));
    for (let i = i0; i < N; i++) {
      const y = top + this.ys[i] - st,
        h = this.hs[i];
      if (y > H) break;
      const n = nights[i];
      const gap = h >= 7 ? 1 : 0;
      const focusRow = S.focus > 0 && Math.abs(n.nmOff) <= S.focus;
      // weekend tint in the gutter
      if ((n.dow === 5 || n.dow === 6) && h >= 11) {
        ctx.fillStyle = C.weekend;
        ctx.fillRect(0, y, this.GL + this.GM - 2, h - gap);
      }
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
        text(
          `${WD3[n.dow]} ${n.d}`,
          this.GL - 6,
          y + (h - gap) / 2,
          h >= 16 ? 11 : 10,
          wk ? C.ink : C.ink3,
          'right',
          wk ? 650 : 500,
        );
      }
      if (n.d === 1) {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, y - 1, W - this.MINI, 1);
        if (h >= 11) text(MON3[n.m - 1], 8, y + (h - gap) / 2, 11, C.ink, 'left', 700);
        else
          text(`${MON3[n.m - 1]}${n.m === 1 ? ' ' + n.y : ''}`, 8, y + 6, 10.5, C.ink, 'left', 700);
      }
      // moon column
      const mx = this.GL + this.GM / 2;
      if (h >= 13) moonGlyph(n, mx, y + (h - gap) / 2, Math.min(6, (h - gap) / 2 - 1.5));
      else if (n.quarter === 0 || n.quarter === 2) moonGlyph(n, mx, y + h / 2, 4);
      // right gutter: moon-free hours
      const bx = x1 + 8,
        bw = this.GR - 44;
      const bh = Math.max(1, Math.min(h - gap - 2, 9));
      const len = (bw * n.mfMs) / maxMF;
      if (len > 0) {
        ctx.fillStyle = C.good;
        ctx.fillRect(bx, y + (h - gap - bh) / 2, len, bh);
      }
      if (h >= 12)
        text(
          n.mfMs ? fmtHrs(n.mfMs) + 'h' : '—',
          bx + bw + 4,
          y + (h - gap) / 2,
          10.5,
          n.mfMs ? C.ink2 : C.ink3,
          'left',
          focusRow ? 650 : 500,
        );
      // clock change
      if (n.dst && h >= 11)
        text('Clocks change tonight', x0 + 6, y + (h - gap) / 2, 10, inkOn(C.day), 'left', 650);
      // tonight and selection
      if (i === tonightIdx) {
        ctx.fillStyle = C.now;
        ctx.fillRect(0, y, 3, h - gap);
        const nowH = wallH(Date.now(), n);
        if (nowH > ax.start && nowH < ax.end) {
          ctx.fillStyle = C.now;
          ctx.fillRect(snap(X(nowH)) - 1, y, 2, h - gap);
        }
      }
      if (i === S.sel) {
        ctx.strokeStyle = C.select;
        ctx.lineWidth = 2;
        ctx.strokeRect(x0 - 1, y - 1 + 0.0, cw + 2, h - gap + 2);
      }
      if (S.hover && S.hover.i === i && i !== S.sel) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
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
    const hoverH = S.hover?.hh;
    if (hoverH != null) {
      ctx.fillStyle = C.select;
      ctx.fillRect(snap(X(hoverH)), top, 1, H - top);
    }
    ctx.restore();
    // axis band
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, W, top);
    ctx.fillStyle = C.hair;
    ctx.fillRect(0, top - 1, W, 1);
    for (const t of ticks) {
      if (!t.major) continue;
      text(
        t.label,
        X(t.hh),
        top - 12,
        11,
        t.midnight ? C.ink : C.ink3,
        'center',
        t.midnight ? 650 : 500,
      );
    }
    const f = nights[Math.max(0, this.rowAt(st))];
    text(f ? `${MONL[f.m - 1]} ${f.y}` : 'Night of', 8, top - 12, 11, C.ink, 'left', 700);
    text('Moon-free', x1 + 8, top - 12, 10.5, C.ink3, 'left', 600);
    if (hoverH != null) {
      const s = fmtClock(hoverH),
        wv = tw(s, 11, 650) + 10,
        cx = X(hoverH);
      ctx.fillStyle = C.select;
      roundRect(cx - wv / 2, top - 22, wv, 18, 4);
      ctx.fill();
      text(s, cx, top - 12.5, 11, '#fff', 'center', 650);
    }
    if (this.MINI) this.drawMini(st);
  }

  /** The whole range in miniature at the right edge, with the visible rows outlined. */
  drawMini(st: number): void {
    const { nights } = atlas();
    const { W, H } = size;
    const x = W - this.MINI + 12,
      w = this.MINI - 18,
      y0 = this.AX + 6,
      hAvail = H - this.AX - 14;
    const N = nights.length,
      rh = hAvail / N;
    ctx.fillStyle = C.panel;
    ctx.fillRect(W - this.MINI, this.AX, this.MINI, H - this.AX);
    ctx.fillStyle = C.hair;
    ctx.fillRect(W - this.MINI, this.AX, 1, H - this.AX);
    for (let i = 0; i < N; i++) {
      drawNight(nights[i], x, y0 + i * rh, w, Math.max(1, rh + 0.35), 'h', { mark: false });
      if (nights[i].d === 1)
        text(MON3[nights[i].m - 1][0], x - 6, y0 + i * rh + 4, 8.5, C.ink3, 'center', 600);
    }
    const a = this.rowAt(st),
      b = this.rowAt(st + H - this.AX - 1);
    const i0 = a < 0 ? 0 : a,
      i1 = b < 0 ? N - 1 : b;
    ctx.strokeStyle = C.select;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 2.5, y0 + i0 * rh - 1, w + 5, (i1 - i0 + 1) * rh + 2);
  }

  hit(px: number, py: number): Hit | null {
    const { ax } = atlas();
    const { x0, x1, cw } = this.geom();
    if (this.MINI && px > size.W - this.MINI) return { mini: true, y: py };
    if (py < this.AX) return null;
    const i = this.rowAt(py - this.AX + scroller.scrollTop);
    if (i < 0) return null;
    const hh = px >= x0 && px <= x1 ? ax.start + ((px - x0) / cw) * (ax.end - ax.start) : null;
    return { i, hh };
  }

  /** Scroll so the minimap row under `py` is centered. */
  miniScroll(py: number): void {
    const N = atlas().nights.length;
    const hAvail = size.H - this.AX - 14;
    const i = Math.max(0, Math.min(N - 1, Math.floor(((py - this.AX - 6) / hAvail) * N)));
    scroller.scrollTop = Math.max(0, this.ys[i] - (size.H - this.AX) / 2);
  }
}

export const river = new RiverView();
