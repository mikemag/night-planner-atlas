import { S, atlas } from '../app/state';
import { MON3, MONL, WD3, fmtClock, fmtDur } from '../model/format';
import { wallH } from '../model/night';
import { C, inkOn } from '../render/colors';
import { drawNight, hourTicks, moonGlyph } from '../render/night-draw';
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
  private miniDrag: { y: number; index: number } | null = null;

  geom() {
    const { W } = size;
    this.MINI = S.riverZoom === 'year' || W < 700 ? 0 : 96;
    this.GR = S.riverZoom === 'year' ? (W < 700 ? 56 : 92) : W < 700 ? 88 : 120;
    const wideDates = S.riverZoom === 'week' || (S.focus > 0 && S.riverZoom !== 'year');
    this.GL = W < 700 ? (wideDates ? 56 : 52) : 70;
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
    return { base: 48, fH: 48, cH: 14 };
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

  /** Keep the top visible night, including a partially scrolled row, across row-height changes. */
  anchor(): { i: number; fraction: number } {
    const i = this.topNight();
    return { i, fraction: (scroller.scrollTop - this.ys[i]) / this.hs[i] };
  }

  restoreAnchor({ i, fraction }: { i: number; fraction: number }): void {
    scroller.scrollTop = this.ys[i] + fraction * this.hs[i];
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
      const contextRow = S.focus > 0 && S.riverZoom !== 'year' && !focusRow;
      const weekRow = S.riverZoom === 'week' && !contextRow;
      const weekend = n.dow === 5 || n.dow === 6;
      const monthLabel = S.riverZoom === 'month' && h >= 16;
      // weekend tint in the gutter
      if (weekend && (h >= 11 || contextRow)) {
        ctx.fillStyle = C.weekend;
        ctx.fillRect(0, y, this.GL + this.GM - 2, h - gap);
      }
      drawNight(n, x0, y, cw, h - gap, 'h', {
        labels: h >= 26 || (monthLabel && !n.dst),
        labelWeight: S.riverZoom === 'month' && !weekend && i !== S.sel ? 450 : 600,
        labelSize: S.riverZoom === 'week' ? 11.5 : 10.5,
      });
      // gutter labels
      if (h >= 11 && !contextRow) {
        const wk = n.dow === 5 || n.dow === 6;
        text(
          n.d === 1 ? `${MON3[n.m - 1]} 1` : `${WD3[n.dow]} ${n.d}`,
          this.GL - 6,
          y + (h - gap) / 2,
          h >= 16 ? (weekRow ? 12 : 11) : 10,
          wk ? C.ink : C.ink3,
          'right',
          wk ? 650 : 500,
        );
      }
      if (n.d === 1) {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, y - 1, W - this.MINI, 1);
        if (h < 11 && !contextRow)
          text(`${MON3[n.m - 1]}${n.m === 1 ? ' ' + n.y : ''}`, 8, y + 6, 10.5, C.ink, 'left', 700);
      }
      // moon column
      const mx = this.GL + this.GM / 2;
      if (h >= 13) moonGlyph(n, mx, y + (h - gap) / 2, Math.min(6, (h - gap) / 2 - 1.5));
      else if (n.quarter === 0 || n.quarter === 2) moonGlyph(n, mx, y + h / 2, 4);
      // right gutter: moon-free hours
      const bx = x1 + 8,
        bw = this.GR - (S.riverZoom === 'year' ? 44 : 72);
      const bh = Math.max(1, Math.min(h - gap - 2, 9));
      const len = (bw * n.mfMs) / maxMF;
      if (len > 0) {
        ctx.fillStyle = C.good;
        ctx.fillRect(bx, y + (h - gap - bh) / 2, len, bh);
      }
      if (h >= 12)
        text(
          n.mfMs ? fmtDur(n.mfMs) : '—',
          bx + bw + 4,
          y + (h - gap) / 2,
          weekRow ? 11.5 : 10.5,
          n.mfMs ? C.ink2 : C.ink3,
          'left',
          focusRow ? 650 : 500,
        );
      // clock change
      if (n.dst && h >= 11) {
        const label = 'Clocks change tonight';
        const cy = weekRow ? y + 9 : y + (h - gap) / 2;
        ctx.fillStyle = C.day;
        ctx.fillRect(x0 + 3, cy - 7, tw(label, 10, 650) + 6, 14);
        text(label, x0 + 6, cy, 10, inkOn(C.day), 'left', 650);
      }
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
    if (S.focus > 0 && S.riverZoom !== 'year') this.drawContextDates(st);
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
    const narrow = W < 700;
    text(
      f
        ? narrow
          ? `${MON3[f.m - 1]} ’${String(f.y).slice(-2)}`
          : `${MONL[f.m - 1]} ${f.y}`
        : 'Night of',
      8,
      top - 12,
      11,
      C.ink,
      'left',
      700,
    );
    text('Moon-free', x1 + this.GR / 2, top - 12, narrow ? 9 : 10.5, C.ink3, 'center', 600);
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

  /** A sparse date rail for the compressed rows; month labels win nearby collisions. */
  private drawContextDates(st: number): void {
    const { nights } = atlas();
    const { H, W } = size;
    const center = (i: number) => this.AX + this.ys[i] - st + (this.hs[i] - 1) / 2;
    // Include offscreen neighbors so a label does not flicker in as a month crosses the axis.
    const monthCenters = nights.flatMap((n, i) => (n.d === 1 ? [center(i)] : []));
    for (let i = Math.max(0, this.rowAt(st)); i < nights.length; i++) {
      const n = nights[i];
      const cy = center(i);
      if (cy > H + 8) break;
      if (Math.abs(n.nmOff) <= S.focus || (n.d !== 1 && n.dow !== 1)) continue;
      const month = n.d === 1;
      // Ticks retain the exact row position even where a nearby month suppresses a week label.
      ctx.fillStyle = month ? C.ink2 : C.ink3;
      ctx.fillRect(this.GL - 2, snap(cy), 6, 1);
      if (cy < this.AX + 8 || cy > H - 8) continue;
      if (!month && monthCenters.some((y) => Math.abs(y - cy) < 16)) continue;
      const label = month
        ? W < 700
          ? `${MON3[n.m - 1]} ’${String(n.y).slice(-2)}`
          : `${MON3[n.m - 1]} ${n.y}`
        : `Mon ${n.d}`;
      // A small panel-colored backing lets 11.5 px text span an 8 px row without mixing tints.
      const width = tw(label, 11.5, month ? 700 : 500);
      ctx.fillStyle = C.panel;
      ctx.fillRect(this.GL - 8 - width, cy - 7, width + 4, 14);
      text(label, this.GL - 6, cy, 11.5, month ? C.ink : C.ink2, 'right', month ? 700 : 500);
    }
  }

  /** Continuous date position, so dragging also works with unequal focus/context row heights. */
  private datePosition(cy: number): number {
    const N = this.hs.length;
    if (cy >= this.ys[N]) return N;
    const i = Math.max(0, this.rowAt(Math.max(0, cy)));
    return i + (Math.max(0, cy) - this.ys[i]) / this.hs[i];
  }

  private contentPosition(index: number): number {
    const value = Math.max(0, Math.min(this.hs.length, index));
    const i = Math.floor(value);
    return this.ys[i] + (i < this.hs.length ? (value - i) * this.hs[i] : 0);
  }

  miniGeom(st = scroller.scrollTop) {
    const x = size.W - this.MINI + 44;
    const w = this.MINI - 50;
    const y = this.AX + 8;
    const h = Math.max(1, size.H - this.AX - 16);
    const rh = h / this.hs.length;
    const first = y + this.datePosition(st) * rh;
    const last = y + this.datePosition(st + size.H - this.AX) * rh;
    const thumbH = Math.min(h, Math.max(24, last - first));
    const thumbY = Math.max(y, Math.min(y + h - thumbH, (first + last - thumbH) / 2));
    return { x, w, y, h, rh, thumbY, thumbH };
  }

  miniContains(px: number, py: number): boolean {
    const { x, w, thumbY, thumbH } = this.miniGeom();
    return px >= x - 3 && px <= x + w + 3 && py >= thumbY && py <= thumbY + thumbH;
  }

  /** The whole range in miniature, with readable dates and a viewport that can be grabbed. */
  drawMini(st: number): void {
    const { nights } = atlas();
    const { W, H } = size;
    const { x, w, y: y0, rh, thumbY, thumbH } = this.miniGeom(st);
    const N = nights.length;
    ctx.fillStyle = C.panel;
    ctx.fillRect(W - this.MINI, this.AX, this.MINI, H - this.AX);
    ctx.fillStyle = C.hair;
    ctx.fillRect(W - this.MINI, this.AX, 1, H - this.AX);
    const firstYear = nights[0].y,
      lastYear = nights[N - 1].y;
    text(
      firstYear === lastYear ? String(firstYear) : `${firstYear}–${String(lastYear).slice(-2)}`,
      W - this.MINI / 2,
      this.AX - 12,
      10.5,
      C.ink2,
      'center',
      600,
    );
    for (let i = 0; i < N; i++) {
      drawNight(nights[i], x, y0 + i * rh, w, Math.max(1, rh + 0.35), 'h');
    }
    for (let i = 0; i < N; i++) {
      const n = nights[i];
      if (n.d !== 1) continue;
      const y = y0 + i * rh;
      ctx.fillStyle = n.m === 1 ? C.ink2 : C.hair;
      ctx.fillRect(x - 4, y, w + 4, n.m === 1 ? 2 : 1);
      text(MON3[n.m - 1], W - this.MINI + 7, y + 7, 11.5, C.ink2, 'left', n.m === 1 ? 700 : 500);
    }
    ctx.fillStyle = C.select;
    ctx.globalAlpha = 0.16;
    ctx.fillRect(x - 3, thumbY, w + 6, thumbH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.select;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 3, thumbY, w + 6, thumbH);
    ctx.fillStyle = C.select;
    const gripY = thumbY + thumbH / 2;
    ctx.fillRect(x + w / 2 - 6, gripY - 2, 12, 1);
    ctx.fillRect(x + w / 2 - 6, gripY + 2, 12, 1);
  }

  hit(px: number, py: number): Hit | null {
    const { ax } = atlas();
    const { x0, x1, cw } = this.geom();
    if (py < this.AX) return null;
    if (this.MINI && px > size.W - this.MINI) return { mini: true, y: py };
    const i = this.rowAt(py - this.AX + scroller.scrollTop);
    if (i < 0) return null;
    const hh = px >= x0 && px <= x1 ? ax.start + ((px - x0) / cw) * (ax.end - ax.start) : null;
    return { i, hh };
  }

  beginMiniDrag(px: number, py: number): void {
    if (!this.miniContains(px, py)) {
      const { y, rh } = this.miniGeom();
      scroller.scrollTop = Math.max(
        0,
        this.contentPosition((py - y) / rh) - (size.H - this.AX) / 2,
      );
    }
    this.miniDrag = { y: py, index: this.datePosition(scroller.scrollTop) };
  }

  /** Drag by date distance from the original grab, with no recentering or row snapping. */
  dragMinimap(py: number): void {
    if (!this.miniDrag) return;
    const { rh } = this.miniGeom();
    scroller.scrollTop = this.contentPosition(this.miniDrag.index + (py - this.miniDrag.y) / rh);
  }

  endMiniDrag(): void {
    this.miniDrag = null;
  }
}

export const river = new RiverView();
