import { S, atlas } from '../app/state';
import { MON3, MONL, WD3, fmtClock, fmtDur } from '../model/format';
import { wallH } from '../model/night';
import { C, inkOn } from '../render/colors';
import { drawDurationBar } from '../render/duration';
import { drawNight, hourTicks, moonGlyph } from '../render/night-draw';
import { ctx, roundRect, size, snap, text, tw } from '../render/surface';
import { scroller } from '../ui/dom';
import { prepareRiverDetail, placeRiverDetail } from '../ui/river-detail';
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
  /** Expanded nights retain the same sky-band height as their compact neighbors. */
  get detailHeader(): number {
    const { base, fH } = this.heights();
    const n = atlas().nights[S.sel];
    return S.focus > 0 && n && Math.abs(n.nmOff) <= S.focus ? fH : base;
  }
  private miniDrag: { y: number; index: number } | null = null;

  geom() {
    const { W } = size;
    this.MINI = S.riverZoom === 'year' || W < 700 ? 0 : 96;
    this.GR = S.riverZoom === 'year' ? (W < 700 ? 56 : 92) : W < 700 ? 88 : 120;
    const wideDates = S.focus > 0 && S.riverZoom !== 'year';
    this.GL = W < 700 ? (wideDates ? 56 : 52) : 70;
    // January includes the year; leave it clear of the event ticks on narrow screens.
    if (W < 700 && S.riverZoom === 'year') this.GL = 60;
    const x0 = this.GL + this.GM,
      x1 = W - this.GR - this.MINI;
    return { x0, x1, cw: Math.max(40, x1 - x0) };
  }

  /** Row heights: the zoom sets them, and new-moon focus splits them into focus and context. */
  heights() {
    const N = atlas().nights.length;
    const avail = size.H - this.AX - 12;
    const z = S.riverZoom;
    if (z === 'year') {
      const b = Math.max(0.1, avail / N);
      return { base: b, fH: b, cH: b };
    }
    return { base: size.W < 700 ? 32 : 20, fH: 34, cH: 8 };
  }

  layout(): void {
    const { nights } = atlas();
    const N = nights.length;
    this.hs = new Float64Array(N);
    this.ys = new Float64Array(N + 1);
    const { base, fH, cH } = this.heights();
    const { x0, cw } = this.geom();
    const { ax } = atlas();
    const detailHeight = prepareRiverDetail(
      S.riverZoom === 'month' && S.riverExpanded ? nights[S.sel] : null,
      {
        width: size.W - this.MINI,
        x0,
        cw,
        start: ax.start,
        end: ax.end,
        moonX: this.GL + this.GM / 2,
      },
      size.W < 700,
    );
    let y = 0;
    for (let i = 0; i < N; i++) {
      let h = base;
      if (S.focus > 0 && S.riverZoom !== 'year') h = Math.abs(nights[i].nmOff) <= S.focus ? fH : cH;
      this.ys[i] = y;
      if (S.riverZoom === 'month' && S.riverExpanded && i === S.sel)
        h = this.detailHeader + detailHeight;
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
    if (top) scroller.scrollTop = y;
    else this.reveal(i);
  }

  /** Reveal only as much as necessary; oversized details start below the pinned axis. */
  reveal(i: number): void {
    const available = size.H - this.AX;
    const y = this.ys[i];
    if (y < scroller.scrollTop || this.hs[i] > available) scroller.scrollTop = y;
    else if (y + this.hs[i] > scroller.scrollTop + available)
      scroller.scrollTop = y + this.hs[i] - available;
  }

  draw(st: number): void {
    const { nights, ax, maxMF, tonightIdx, quarters, tz } = atlas();
    const { W, H } = size;
    const { x0, x1, cw } = this.geom();
    if (S.riverZoom === 'month' && S.riverExpanded && S.sel >= 0)
      placeRiverDetail(this.AX + this.ys[S.sel] + this.detailHeader, st, this.AX);
    const top = this.AX,
      N = nights.length;
    const span = ax.end - ax.start;
    const X = (hh: number) => x0 + ((hh - ax.start) / span) * cw;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W - this.MINI, H - top);
    ctx.clip();
    const i0 = Math.max(0, this.rowAt(st));
    const newMoonTicks: number[] = [];
    const newMoonLabels: Array<{ x: number; y: number; lines: string[] }> = [];
    for (let i = i0; i < N; i++) {
      const y = top + this.ys[i] - st,
        h = this.hs[i];
      if (y > H) break;
      const n = nights[i];
      const expanded = S.riverZoom === 'month' && S.riverExpanded && i === S.sel;
      const barH = expanded ? this.detailHeader : h;
      const gap = barH >= 7 ? 1 : 0;
      const focusRow = S.focus > 0 && Math.abs(n.nmOff) <= S.focus;
      const contextRow = S.focus > 0 && S.riverZoom !== 'year' && !focusRow && !expanded;
      const weekend = n.dow === 5 || n.dow === 6;
      const monthLabel = S.riverZoom === 'month' && barH >= 16;
      // weekend tint in the gutter
      if (weekend && (barH >= 11 || contextRow)) {
        ctx.fillStyle = C.weekend;
        ctx.fillRect(0, y, this.GL + this.GM - 2, barH - gap);
      }
      drawNight(n, x0, y, cw, barH - gap, 'h', {
        labels:
          !expanded && !(W < 700 && n.quarter === 0) && (barH >= 26 || (monthLabel && !n.dst)),
        labelWeight: S.riverZoom === 'month' && !weekend && i !== S.sel ? 450 : 600,
        labelSize: expanded ? 11.5 : 10.5,
      });
      // gutter labels
      if (barH >= 11 && !contextRow) {
        const wk = n.dow === 5 || n.dow === 6;
        text(
          n.d === 1 ? `${MON3[n.m - 1]} 1` : `${WD3[n.dow]} ${n.d}`,
          this.GL - 6,
          y + (barH - gap) / 2,
          barH >= 16 ? (expanded ? 12 : 11) : 10,
          wk ? C.ink : C.ink3,
          'right',
          wk ? 650 : 500,
        );
      }
      if (n.d === 1) {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, y - 1, W - this.MINI, 1);
        if (barH < 11 && !contextRow)
          text(`${MON3[n.m - 1]}${n.m === 1 ? ' ' + n.y : ''}`, 8, y + 6, 10.5, C.ink, 'left', 700);
      }
      // moon column
      const mx = this.GL + this.GM / 2;
      if (n.quarter === 0 && S.riverZoom === 'year') newMoonTicks.push(y + (barH - gap) / 2);
      else if (barH >= 13)
        moonGlyph(n, mx, y + (barH - gap) / 2, Math.min(6, (barH - gap) / 2 - 1.5));
      else if (n.quarter === 2) moonGlyph(n, mx, y + barH / 2, 4);
      if (n.quarter === 0 && S.riverZoom === 'month') {
        const event = quarters.find((q) => q.q === 0 && q.i === i);
        let lines = ['New Moon'];
        if (event) {
          const p = tz.wallParts(event.t + 30_000);
          const dateTime = `${MON3[p.m - 1]} ${p.d}, ${fmtClock(p.h + p.mi / 60 - 12)}`;
          lines = W < 700 ? ['New Moon', dateTime] : [`New Moon · ${dateTime}`];
        }
        const { sunset, sunrise } = n.evH;
        const center =
          sunset != null && sunrise != null ? (sunset + sunrise) / 2 : (ax.start + ax.end) / 2;
        newMoonLabels.push({ x: X(center), y: y + (barH - gap) / 2, lines });
      }
      // Right gutter: usable dark
      const bx = x1 + 8,
        bw = this.GR - (S.riverZoom === 'year' ? 44 : 72);
      const bh = Math.max(1, Math.min(barH - gap - 2, 9));
      drawDurationBar(n.mfMs, maxMF, bx, y + (barH - gap - bh) / 2, bw, bh);
      if (barH >= 12)
        text(
          n.mfMs ? fmtDur(n.mfMs) : '—',
          bx + bw + 4,
          y + (barH - gap) / 2,
          expanded ? 11.5 : 10.5,
          n.mfMs ? C.ink2 : C.ink3,
          'left',
          focusRow ? 650 : 500,
        );
      // clock change
      if (n.dst && barH >= 11 && !expanded) {
        const label = 'Clocks change tonight';
        const cy = y + (barH - gap) / 2;
        ctx.fillStyle = C.day;
        ctx.fillRect(x0 + 3, cy - 7, tw(label, 10, 650) + 6, 14);
        text(label, x0 + 6, cy, 10, inkOn(C.day), 'left', 650);
      }
      // tonight and selection
      if (i === tonightIdx) {
        ctx.fillStyle = C.now;
        ctx.fillRect(0, y, 3, barH - gap);
        const nowH = wallH(Date.now(), n);
        if (nowH > ax.start && nowH < ax.end) {
          ctx.fillStyle = C.now;
          ctx.fillRect(snap(X(nowH)) - 1, y, 2, barH - gap);
        }
      }
      if (i === S.sel) {
        ctx.strokeStyle = C.select;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, y, W - this.MINI - 2, h - 1);
      }
      if (S.hover && S.hover.i === i && i !== S.sel) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y + 0.5, cw - 1, barH - gap - 1);
      }
    }
    // Draw after the rows so a nearby month boundary cannot cover a Year marker.
    ctx.fillStyle = C.ink;
    for (const cy of newMoonTicks) ctx.fillRect(this.GL + this.GM / 2 - 7, snap(cy - 1), 14, 2);
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
    // Keep the event label in the sky where people scan, clear of grid/crosshair strokes.
    for (const { x: cx, y, lines } of newMoonLabels) {
      const width = Math.max(...lines.map((line) => tw(line, 11.5, 650))) + 16;
      const height = lines.length === 1 ? 16 : 28;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y - height / 2, cw, height);
      ctx.clip();
      ctx.fillStyle = C.ink;
      roundRect(cx - width / 2, y - height / 2, width, height, 4);
      ctx.fill();
      lines.forEach((line, i) =>
        text(line, cx, y + (i - (lines.length - 1) / 2) * 12, 11.5, inkOn(C.ink), 'center', 650),
      );
      ctx.restore();
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
        t.hh === ax.start ? 'left' : t.hh === ax.end ? 'right' : 'center',
        t.midnight ? 650 : 500,
      );
    }
    const f = nights[Math.max(0, this.rowAt(st))];
    const narrow = W < 700;
    const fullMonth = f ? `${MONL[f.m - 1]} ${f.y}` : 'Night of';
    text(
      f
        ? narrow
          ? `${MON3[f.m - 1]} ’${String(f.y).slice(-2)}`
          : tw(fullMonth, 11, 700) <= x0 - 16
            ? fullMonth
            : `${MON3[f.m - 1]} ${f.y}`
        : 'Night of',
      8,
      top - 12,
      11,
      C.ink,
      'left',
      700,
    );
    text('Usable dark', x1 + this.GR / 2, top - 12, narrow ? 9 : 10.5, C.ink3, 'center', 600);
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
      if (
        (S.riverExpanded && i === S.sel) ||
        Math.abs(n.nmOff) <= S.focus ||
        (n.d !== 1 && n.dow !== 1)
      )
        continue;
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
    if (
      S.riverZoom === 'month' &&
      S.riverExpanded &&
      i === S.sel &&
      py - this.AX + scroller.scrollTop - this.ys[i] >= this.detailHeader
    )
      return null;
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
