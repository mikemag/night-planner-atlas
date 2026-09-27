import { S, atlas } from '../app/state';
import { MON3, WD1, WD3, fmtDur, fmtHrs } from '../model/format';
import { lunWindow } from '../model/range';
import { MS_H } from '../model/time';
import { C } from '../render/colors';
import { drawNight } from '../render/night-draw';
import { ctx, size, text } from '../render/surface';
import { scroller } from '../ui/dom';
import type { CanvasView, Hit } from './view';

/** One row per lunar cycle, aligned so the new-moon night is the center column. */
class LunationsView implements CanvasView {
  TOP = 30;
  LW = 132;
  RW = 132;
  PAD = 10;
  total = 0;

  geom() {
    const { W } = size;
    const N = lunWindow(S.focus),
      cols = 2 * N + 1;
    const LW = W < 760 ? 80 : this.LW,
      RW = W < 760 ? 0 : this.RW;
    const cw = (W - this.PAD * 2 - LW - RW) / cols;
    const rh = cw >= 56 ? 150 : cw >= 36 ? 132 : 118;
    return { N, cols, LW, RW, cw, rh, x0: this.PAD + LW };
  }

  layout(): void {
    const { rh } = this.geom();
    this.total = this.TOP + atlas().lunations.length * (rh + 10) + 16;
  }

  topNight(): number {
    const { lunations } = atlas();
    const { rh } = this.geom();
    const k = Math.max(
      0,
      Math.min(lunations.length - 1, Math.floor(scroller.scrollTop / (rh + 10))),
    );
    return Math.max(0, lunations[k] ? lunations[k].i : 0);
  }

  scrollTo(i: number, top: boolean): void {
    const { lunations } = atlas();
    const { rh, N } = this.geom();
    let k = lunations.findIndex((L) => i >= L.i - N && i <= L.i + N);
    if (k < 0) k = lunations.findIndex((L) => L.i >= i);
    if (k < 0) return;
    const y = k * (rh + 10);
    const vis0 = scroller.scrollTop,
      vis1 = vis0 + size.H - this.TOP;
    if (top || y < vis0 || y + rh > vis1) scroller.scrollTop = Math.max(0, y - (top ? 0 : 40));
  }

  draw(st: number): void {
    const r = atlas();
    const { nights, lunations, tonightIdx } = r;
    const { W, H } = size;
    const { N, cols, LW, RW, cw, rh, x0 } = this.geom();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, this.TOP, W, H - this.TOP);
    ctx.clip();
    lunations.forEach((L, k) => {
      const y = this.TOP + k * (rh + 10) - st + 6;
      if (y + rh < this.TOP || y > H) return;
      // row header
      const nmWall = r.tz.wallParts(L.t);
      const wd = WD3[new Date(Date.UTC(nmWall.y, nmWall.m - 1, nmWall.d)).getUTCDay()];
      text('New moon', this.PAD, y + 12, 10, C.ink3, 'left', 650);
      text(
        `${wd} ${MON3[nmWall.m - 1]} ${nmWall.d}`,
        this.PAD,
        y + 30,
        LW < 100 ? 12 : 15,
        C.ink,
        'left',
        700,
      );
      const fi = Math.max(0, L.i - N),
        la = Math.min(nights.length - 1, L.i + N);
      text(
        `${MON3[nights[fi].m - 1]} ${nights[fi].d} – ${MON3[nights[la].m - 1]} ${nights[la].d}`,
        this.PAD,
        y + 48,
        11,
        C.ink3,
        'left',
        500,
      );
      if (LW >= 100) {
        ctx.fillStyle = C.good;
        ctx.fillRect(this.PAD, y + rh - 26, 7, 7);
        text(`${Math.round(L.total / MS_H)}h`, this.PAD + 12, y + rh - 22, 13, C.ink, 'left', 700);
        text(`moon-free in ±${N}`, this.PAD, y + rh - 8, 10, C.ink3, 'left', 500);
      }
      // cells
      const labH = 16,
        footH = cw >= 24 ? 16 : 0,
        g = cw >= 14 ? 2 : 1;
      for (let c = 0; c < cols; c++) {
        const off = c - N,
          i = L.i + off;
        const cx = x0 + c * cw;
        if (i < 0 || i >= nights.length) {
          ctx.fillStyle = C.chip;
          ctx.fillRect(cx, y + labH, cw - g, rh - labH - footH);
          continue;
        }
        const n = nights[i];
        const wk = n.dow === 5 || n.dow === 6;
        if (wk) {
          ctx.fillStyle = C.weekend;
          ctx.fillRect(cx, y, cw - g, labH);
        }
        const lab = cw >= 40 ? `${WD1[n.dow]} ${n.d === 1 ? MON3[n.m - 1] + ' 1' : n.d}` : `${n.d}`;
        text(
          lab,
          cx + (cw - g) / 2,
          y + labH / 2,
          cw >= 30 ? 10.5 : 9,
          wk ? C.ink : C.ink3,
          'center',
          wk ? 700 : 500,
        );
        drawNight(n, cx, y + labH, cw - g, rh - labH - footH, 'v', { labels: cw >= 58 });
        if (footH)
          text(
            n.mfMs ? fmtHrs(n.mfMs) : '—',
            cx + (cw - g) / 2,
            y + rh - footH / 2,
            cw >= 34 ? 10.5 : 9,
            n.mfMs ? C.ink2 : C.ink3,
            'center',
            n.mfMs >= 4 * MS_H ? 650 : 500,
          );
        if (off === 0) {
          ctx.fillStyle = C.ink;
          ctx.fillRect(cx, y + rh + 2, cw - g, 2);
        }
        if (i === tonightIdx) {
          ctx.strokeStyle = C.now;
          ctx.lineWidth = 2;
          ctx.strokeRect(cx + 1, y + labH + 1, cw - g - 2, rh - labH - footH - 2);
        }
        if (i === S.sel) {
          ctx.strokeStyle = C.select;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(cx - 0.5, y - 0.5, cw - g + 1, rh + 1);
        } else if (S.hover && S.hover.i === i) {
          ctx.strokeStyle = C.hair2;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx, y, cw - g, rh);
        }
      }
      // best weekend summary
      if (RW && L.best) {
        const rx = x0 + cols * cw + 12;
        const a = nights[L.best.i],
          b = nights[L.best.i + 1];
        text('Best weekend', rx, y + 12, 10, C.ink3, 'left', 650);
        text(
          `Fri–Sat ${MON3[a.m - 1]} ${a.d}–${b.m !== a.m ? MON3[b.m - 1] + ' ' : ''}${b.d}`,
          rx,
          y + 30,
          12.5,
          C.ink,
          'left',
          650,
        );
        ctx.fillStyle = C.good;
        ctx.fillRect(rx, y + 44, 7, 7);
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
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, W, this.TOP);
    ctx.fillStyle = C.hair;
    ctx.fillRect(0, this.TOP - 1, W, 1);
    text('Nights from new moon →', this.PAD, this.TOP / 2, 10, C.ink3, 'left', 600);
    for (let c = 0; c < cols; c++) {
      const off = c - N;
      if (cw < 22 && off % 2) continue;
      text(
        off === 0 ? 'New' : (off > 0 ? '+' : '−') + Math.abs(off),
        x0 + c * cw + (cw - 2) / 2,
        this.TOP / 2,
        10.5,
        off === 0 ? C.ink : C.ink3,
        'center',
        off === 0 ? 700 : 500,
      );
    }
    if (RW) text('Trip pick', x0 + cols * cw + 12, this.TOP / 2, 10, C.ink3, 'left', 600);
  }

  hit(px: number, py: number): Hit | null {
    const { nights, lunations } = atlas();
    if (py < this.TOP) return null;
    const { N, cols, cw, rh, x0 } = this.geom();
    const cy = py - this.TOP + scroller.scrollTop - 6;
    const k = Math.floor(cy / (rh + 10));
    if (k < 0 || k >= lunations.length || cy - k * (rh + 10) > rh) return null;
    const c = Math.floor((px - x0) / cw);
    if (c < 0 || c >= cols) return null;
    const i = lunations[k].i + c - N;
    return i >= 0 && i < nights.length ? { i } : null;
  }
}

export const lunations = new LunationsView();
