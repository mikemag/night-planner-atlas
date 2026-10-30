import { S, activeFocus, atlas } from '../app/state';
import { MON3, WD3, fmtHrs } from '../model/format';
import { lunWindow, lunationWindow, visibleLunations, type Lunation } from '../model/range';
import { MS_H } from '../model/time';
import { C } from '../render/colors';
import { drawNight, hourTicks } from '../render/night-draw';
import { ctx, size, snap, text } from '../render/surface';
import { el, scroller } from '../ui/dom';
import {
  LUNATION_DETAIL_HEIGHT,
  placeLunationsDetail,
  prepareLunationsDetail,
} from '../ui/lunations-detail';
import { drawNightDetail, nightDetailGeometry } from '../ui/night-detail';
import { placeLunationsHeaders, prepareLunationsHeaders } from '../ui/lunations-headers';
import type { CanvasView, Hit } from './view';

interface LunationAnchor {
  t: number;
  fraction: number;
  offset: number;
}

/** Equal-width cycles, a shared vertical clock and one optional horizontal night timeline. */
class LunationsView implements CanvasView {
  TOP = 32;
  DATE = 28;
  SKY = 240;
  GRAPH = 72;
  FOOT = 18;
  GAP = 16;
  total = 0;
  cycles: Lunation[] = [];
  ys: number[] = [];
  hs: number[] = [];
  private lastGeometry: ReturnType<LunationsView['geom']> | null = null;

  geom() {
    const { W } = size;
    const N = lunWindow(activeFocus());
    const cols = 2 * N + 1;
    const pad = 8;
    const x0 = W < 700 ? 50 : 60;
    const available = Math.max(1, W - x0 - pad);
    // Seven phone columns fit; wider requested windows retain a readable, pannable width.
    const cw = Math.max(40, available / cols);
    const header = W < 700 ? 88 : 56;
    const body = header + this.DATE + this.SKY + this.GRAPH + this.FOOT;
    // Use the exact viewport width when it fits; rounding cw * cols upward can add a scrollbar.
    return {
      N,
      cols,
      cw,
      x0,
      pad,
      available,
      header,
      body,
      width: Math.max(W, x0 + cols * 40 + pad),
    };
  }

  layout(): void {
    const r = atlas();
    const g = this.geom();
    this.cycles = visibleLunations(r, g.N);
    const selected = this.cycleFor(S.sel);
    const n = S.lunationsExpanded && selected >= 0 ? r.nights[S.sel] : null;
    const window = selected >= 0 ? lunationWindow(this.cycles[selected], g.N) : null;
    prepareLunationsDetail(
      n ?? null,
      this.detailGeom(),
      !!n && !!window && (S.sel < window.first || S.sel > window.last),
    );
    prepareLunationsHeaders(r, g.N);
    let y = 8;
    this.ys = [];
    this.hs = [];
    for (let k = 0; k < this.cycles.length; k++) {
      const h = g.body + this.GAP + (n && k === selected ? LUNATION_DETAIL_HEIGHT : 0);
      this.ys.push(y);
      this.hs.push(h);
      y += h;
    }
    this.total = this.TOP + y;
    el('sizer').style.width = `${Math.ceil(g.width)}px`;
    if (!this.lastGeometry || this.lastGeometry.N !== g.N)
      scroller.scrollLeft = Math.max(0, (g.cols * g.cw - g.available) / 2);
    this.lastGeometry = g;
  }

  private detailGeom() {
    return nightDetailGeometry();
  }

  cycleAt(y: number): number {
    for (let k = this.ys.length - 1; k >= 0; k--) if (this.ys[k] <= y) return k;
    return 0;
  }

  cycleFor(i: number): number {
    const owner = this.cycles.findIndex((L) => i >= L.first && i <= L.last);
    if (owner >= 0) return owner;
    let best = -1;
    const mid = atlas().nights[i]?.mid;
    const distance = (L: Lunation) => (mid == null ? Math.abs(L.i - i) : Math.abs(L.t - mid));
    for (let k = 0; k < this.cycles.length; k++)
      if (best < 0 || distance(this.cycles[k]) < distance(this.cycles[best])) best = k;
    return best;
  }

  topNight(): number {
    return Math.max(
      0,
      Math.min(atlas().nights.length - 1, this.cycles[this.cycleAt(scroller.scrollTop)]?.i ?? 0),
    );
  }

  anchor(): LunationAnchor | null {
    const g = this.lastGeometry;
    if (!g || !this.cycles.length) return null;
    const k = this.cycleAt(scroller.scrollTop);
    return {
      t: this.cycles[k].t,
      fraction: (scroller.scrollTop - this.ys[k]) / this.hs[k],
      offset: (scroller.scrollLeft + g.available / 2) / g.cw - g.N - 0.5,
    };
  }

  restoreAnchor(anchor: LunationAnchor): void {
    const k = this.cycles.findIndex((L) => L.t === anchor.t);
    if (k < 0) return;
    scroller.scrollTop = this.ys[k] + anchor.fraction * this.hs[k];
    const g = this.geom();
    scroller.scrollLeft = Math.max(0, (g.N + 0.5 + anchor.offset) * g.cw - g.available / 2);
  }

  scrollTo(i: number, top: boolean): void {
    const k = this.cycleFor(i);
    if (k < 0) return;
    if (top) scroller.scrollTop = this.ys[k];
    else this.reveal(i);
    const g = this.geom();
    const col = i - this.cycles[k].i + g.N;
    if (col < 0 || col >= g.cols) return;
    const x = col * g.cw;
    if (x < scroller.scrollLeft) scroller.scrollLeft = x;
    else if (x + g.cw > scroller.scrollLeft + g.available)
      scroller.scrollLeft = x + g.cw - g.available;
  }

  reveal(i: number): void {
    const k = this.cycleFor(i);
    if (k < 0) return;
    const g = this.geom();
    const y = this.ys[k];
    const expanded = S.lunationsExpanded && i === S.sel;
    const bottom = y + g.body + (expanded ? LUNATION_DETAIL_HEIGHT : 0);
    const available = size.H - this.TOP;
    if (expanded) {
      if (
        bottom > scroller.scrollTop + available ||
        bottom < scroller.scrollTop + LUNATION_DETAIL_HEIGHT
      )
        scroller.scrollTop = Math.max(y, bottom - available);
    } else if (
      y < scroller.scrollTop ||
      y + g.header + this.DATE + this.SKY > scroller.scrollTop + available
    )
      scroller.scrollTop = y;
  }

  stepCycle(dir: number): void {
    const k = Math.max(0, Math.min(this.cycles.length - 1, this.cycleAt(scroller.scrollTop) + dir));
    scroller.scrollTop = this.ys[k] ?? 0;
  }

  /** Horizontal arrows visit shown dates; vertical arrows preserve the new-moon offset. */
  navigate(key: string): number {
    const { N } = this.geom();
    const k = this.cycleFor(S.sel);
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const next = Math.max(0, Math.min(this.cycles.length - 1, k + (key === 'ArrowUp' ? -1 : 1)));
      const off = Math.max(-N, Math.min(N, S.sel - this.cycles[k].i));
      const window = lunationWindow(this.cycles[next], N);
      return Math.max(
        0,
        window.first,
        Math.min(atlas().nights.length - 1, window.last, this.cycles[next].i + off),
      );
    }
    const indices = this.cycles.flatMap((L) => {
      const window = lunationWindow(L, N);
      const first = Math.max(0, window.first),
        last = Math.min(atlas().nights.length - 1, window.last);
      return Array.from({ length: last - first + 1 }, (_, c) => first + c);
    });
    return key === 'ArrowLeft'
      ? ([...indices].reverse().find((i) => i < S.sel) ?? indices[0])
      : (indices.find((i) => i > S.sel) ?? indices.at(-1)!);
  }

  draw(st: number): void {
    const r = atlas();
    const { W, H } = size;
    const g = this.geom();
    const left = scroller.scrollLeft;
    const X = (c: number) => g.x0 + c * g.cw - left;
    const selected = this.cycleFor(S.sel);
    placeLunationsHeaders(this.ys, g.header, st, left, W, this.TOP);
    if (S.lunationsExpanded && selected >= 0)
      placeLunationsDetail(this.TOP + this.ys[selected] + g.body, st, left, W, this.TOP);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, this.TOP, W, H - this.TOP);
    ctx.clip();
    const span = r.ax.end - r.ax.start;
    const maxHours = Math.max(2, Math.ceil(r.maxMF / MS_H / 2) * 2);
    for (let k = this.cycleAt(st); k < this.cycles.length; k++) {
      const L = this.cycles[k];
      const window = lunationWindow(L, g.N);
      const y = this.TOP + this.ys[k] - st;
      if (y > H) break;
      const dates = y + g.header;
      const sky = dates + this.DATE;
      const base = sky + this.SKY + 52;
      const Y = (hh: number) => sky + ((hh - r.ax.start) / span) * this.SKY;
      ctx.save();
      ctx.beginPath();
      ctx.rect(g.x0, dates, g.available, this.DATE + this.SKY + this.GRAPH + this.FOOT);
      ctx.clip();
      for (let c = 0; c < g.cols; c++) {
        const i = L.i + c - g.N;
        if (i < window.first || i > window.last) continue;
        const x = X(c);
        if (x + g.cw < g.x0 || x > W) continue;
        const n = r.nights[i];
        if (!n) {
          ctx.fillStyle = C.chip;
          ctx.fillRect(x, sky, g.cw - 2, this.SKY);
          text('—', x + g.cw / 2, dates + 17, 11, C.ink3, 'center');
          continue;
        }
        const weekend = n.dow === 5 || n.dow === 6;
        if (weekend) {
          ctx.fillStyle = C.weekend;
          ctx.fillRect(x, dates, g.cw - 2, this.DATE);
        }
        text(
          WD3[n.dow],
          x + (g.cw - 2) / 2,
          dates + 7,
          9.5,
          weekend ? C.ink : C.ink3,
          'center',
          weekend ? 650 : 450,
        );
        text(
          n.d === 1 ? `${MON3[n.m - 1]} 1` : String(n.d),
          x + (g.cw - 2) / 2,
          dates + 20,
          11,
          C.ink,
          'center',
          n.d === 1 || c === g.N ? 700 : 500,
        );
        drawNight(n, x, sky, g.cw - 2, this.SKY, 'v', { labels: g.cw >= 58 });
        const height = (n.mfMs / MS_H / maxHours) * 32;
        ctx.fillStyle = C.good;
        if (height > 0)
          ctx.fillRect(x + 4, base - Math.max(1, height), g.cw - 10, Math.max(1, height));
        text(
          n.mfMs ? fmtHrs(n.mfMs) : '—',
          x + (g.cw - 2) / 2,
          base + 12,
          10,
          n.mfMs ? C.ink2 : C.ink3,
          'center',
          weekend ? 650 : 450,
        );
        if (n.d === 1) {
          ctx.strokeStyle = C.hair2;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(x - 1, sky);
          ctx.lineTo(x - 1, base);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (c === g.N) {
          ctx.fillStyle = C.ink;
          ctx.fillRect(x, sky - 2, g.cw - 2, 2);
        }
        if (i === r.tonightIdx) {
          ctx.strokeStyle = C.now;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, sky + 2, g.cw - 6, this.SKY - 4);
        }
        if (i === S.sel || S.hover?.i === i) {
          ctx.strokeStyle = i === S.sel ? C.select : C.hair2;
          ctx.lineWidth = i === S.sel ? 2 : 1;
          ctx.strokeRect(x, dates, g.cw - 2, this.DATE + this.SKY + this.GRAPH - 2);
        }
      }
      for (const tick of hourTicks(this.SKY / span)) {
        if (!tick.major) continue;
        ctx.strokeStyle = tick.midnight ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash(tick.midnight ? [] : [2, 4]);
        ctx.beginPath();
        ctx.moveTo(g.x0, snap(Y(tick.hh)));
        ctx.lineTo(W - g.pad, snap(Y(tick.hh)));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = C.hair;
      ctx.fillRect(g.x0, base, g.available, 1);
      if (L.best) {
        const c = L.best.i - L.i + g.N;
        ctx.strokeStyle = C.select;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(X(c) + 3, base + 24);
        ctx.lineTo(X(c) + 3, base + 28);
        ctx.lineTo(X(c + 2) - 5, base + 28);
        ctx.lineTo(X(c + 2) - 5, base + 24);
        ctx.stroke();
      }
      ctx.restore();
      text('Evening', g.x0 - 7, dates + 12, 9, C.ink2, 'right', 550);
      text('↓', g.x0 - 7, dates + 24, 10, C.ink2, 'right');
      for (const tick of hourTicks(this.SKY / span)) {
        if (tick.major)
          text(
            tick.label,
            g.x0 - 7,
            Y(tick.hh),
            11,
            tick.midnight ? C.ink : C.ink3,
            'right',
            tick.midnight ? 700 : 450,
          );
      }
      text('Morning', g.x0 - 7, sky + this.SKY + 9, 9, C.ink2, 'right', 550);
      text(`${maxHours}h`, g.x0 - 7, base - 32, 9, C.ink3, 'right');
      text('0h', g.x0 - 7, base, 9, C.ink3, 'right');
      if (S.lunationsExpanded && selected === k) this.drawDetail(y + g.body);
      if (S.lunationsExpanded && selected === k && Math.abs(S.sel - L.i) <= g.N) {
        const cx = X(S.sel - L.i + g.N) + (g.cw - 2) / 2;
        if (cx >= g.x0 && cx <= W - g.pad) {
          ctx.fillStyle = C.select;
          ctx.beginPath();
          ctx.moveTo(cx - 5, y + g.body - 9);
          ctx.lineTo(cx + 5, y + g.body - 9);
          ctx.lineTo(cx, y + g.body - 3);
          ctx.fill();
        }
      }
      ctx.fillStyle = C.hair;
      ctx.fillRect(8, y + this.hs[k] - this.GAP / 2, W - 16, 1);
    }
    ctx.restore();
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, W, this.TOP);
    ctx.fillStyle = C.hair;
    ctx.fillRect(0, this.TOP - 1, W, 1);
    text('Time ↓', 8, this.TOP / 2, 10, C.ink3, 'left', 600);
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x0, 0, g.available, this.TOP);
    ctx.clip();
    for (let c = 0; c < g.cols; c++) {
      const off = c - g.N;
      text(
        off === 0 ? 'New' : `${off > 0 ? '+' : '−'}${Math.abs(off)}`,
        X(c) + (g.cw - 2) / 2,
        this.TOP / 2,
        11,
        off === 0 ? C.ink : C.ink3,
        'center',
        off === 0 ? 700 : 500,
      );
    }
    ctx.restore();
  }

  private drawDetail(y: number): void {
    const n = atlas().nights[S.sel];
    if (n) drawNightDetail(n, y);
  }

  hit(px: number, py: number): Hit | null {
    const g = this.geom();
    if (py < this.TOP || px < g.x0 || px >= size.W - g.pad) return null;
    const cy = py - this.TOP + scroller.scrollTop;
    const k = this.cycleAt(cy);
    const offY = cy - this.ys[k];
    if (offY < g.header || offY >= g.body - this.FOOT) return null;
    const c = Math.floor((px - g.x0 + scroller.scrollLeft) / g.cw);
    if (c < 0 || c >= g.cols) return null;
    const i = this.cycles[k].i + c - g.N;
    const window = lunationWindow(this.cycles[k], g.N);
    if (i < window.first || i > window.last) return null;
    if (i < 0 || i >= atlas().nights.length) return null;
    return { i };
  }
}

export const lunations = new LunationsView();
