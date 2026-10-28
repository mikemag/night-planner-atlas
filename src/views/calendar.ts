import { S, atlas } from '../app/state';
import { nightFacts } from '../model/describe';
import { MON3, MONL, WD1, WD3, fmtClockS, fmtDur } from '../model/format';
import { wallH, type Night } from '../model/night';
import type { Month } from '../model/range';
import { MS_H } from '../model/time';
import { C, inkOn } from '../render/colors';
import { drawNight, hourTicks, moonGlyph, skyColorAt } from '../render/night-draw';
import { chevron, ctx, roundRect, size, snap, text, tw } from '../render/surface';
import { scroller } from '../ui/dom';
import type { CanvasView, Hit } from './view';

type Block =
  | { t: 'head'; mo: Month; y: number; h: number }
  | { t: 'wd'; mo: Month; y: number; h: number }
  | { t: 'week'; mo: Month; wk: number[]; wi: number; y: number; h: number }
  | { t: 'mini'; mo: Month; x: number; y: number; w: number; h: number };
type WeekBlock = Extract<Block, { t: 'week' }>;

/** A month grid (Sunday first) where each day cell holds that evening's night. */
class CalendarView implements CanvasView {
  PAD = 12;
  GUT = 36;
  HEAD = 60;
  WDH = 20;
  MGAP = 22;
  blocks: Block[] = [];
  total = 0;
  /** Year-zoom geometry. */
  yr = { cols: 4, mw: 0, cw: 0, ch: 0, gap: 18 };

  weekKey(mo: Month, wi: number): string {
    return `${mo.key}:${wi}`;
  }

  weekH(mo: Month, wk: number[], wi: number): number {
    const { nights } = atlas();
    const v = S.calOrient === 'v';
    if (S.expandedWeek === this.weekKey(mo, wi)) return v ? 340 : 206;
    if (S.focus > 0) {
      const any = wk.some((i) => i >= 0 && Math.abs(nights[i].nmOff) <= S.focus);
      return any ? (v ? 150 : 104) : v ? 64 : 56;
    }
    return v ? 132 : 96;
  }

  layout(): void {
    this.blocks = [];
    let y = 6;
    if (S.calZoom === 'year') return this.layoutYear();
    for (const mo of atlas().months) {
      this.blocks.push({ t: 'head', mo, y, h: this.HEAD });
      y += this.HEAD;
      this.blocks.push({ t: 'wd', mo, y, h: this.WDH });
      y += this.WDH;
      mo.weeks.forEach((wk, wi) => {
        const h = this.weekH(mo, wk, wi);
        this.blocks.push({ t: 'week', mo, wk, wi, y, h });
        y += h;
      });
      y += this.MGAP;
    }
    this.total = y + 20;
  }

  layoutYear(): void {
    const { months } = atlas();
    const { W } = size;
    const cols = W >= 1100 ? 4 : W >= 720 ? 3 : 2;
    const gap = 18;
    const mw = (W - this.PAD * 2 - gap * (cols - 1)) / cols;
    const cw = mw / 7,
      ch = Math.min(52, cw * 1.35);
    this.yr = { cols, mw, cw, ch, gap };
    let y = 8;
    for (let k = 0; k < months.length; k += cols) {
      const rowMonths = months.slice(k, k + cols);
      const weeks = Math.max(...rowMonths.map((mo) => mo.weeks.length));
      const h = 26 + 16 + weeks * ch + 8;
      rowMonths.forEach((mo, j) =>
        this.blocks.push({ t: 'mini', mo, x: this.PAD + j * (mw + gap), y, w: mw, h }),
      );
      y += h + 14;
    }
    this.total = y + 10;
  }

  topNight(): number {
    const st = scroller.scrollTop;
    for (const b of this.blocks) if (b.y + b.h > st && b.mo) return b.mo.idx[0];
    return 0;
  }

  scrollTo(i: number, top: boolean): void {
    const b = this.blocks.find(
      (b) => (b.t === 'week' && b.wk.includes(i)) || (b.t === 'mini' && b.mo.idx.includes(i)),
    );
    if (!b) return;
    const mh = this.blocks.find((x) => x.t === 'head' && x.mo === b.mo);
    const target = S.calZoom === 'year' ? b.y - 8 : top && mh ? mh.y - 4 : b.y;
    const vis0 = scroller.scrollTop,
      vis1 = vis0 + size.H;
    if (top || b.y < vis0 + 40 || b.y + b.h > vis1)
      scroller.scrollTop = Math.max(0, top ? target : b.y - size.H * 0.35);
  }

  cols() {
    const cw = (size.W - this.PAD * 2 - this.GUT) / 7;
    return { x0: this.PAD + this.GUT, cw };
  }

  draw(st: number): void {
    if (S.calZoom === 'year') return this.drawYear(st);
    const { W, H } = size;
    const { x0, cw } = this.cols();
    for (const b of this.blocks) {
      const y = b.y - st;
      if (y + b.h < 0) continue;
      if (y > H) break;
      if (b.t === 'head') this.drawHead(b.mo, y, x0, cw);
      else if (b.t === 'wd') this.drawWd(y, x0, cw);
      else if (b.t === 'week') this.drawWeek(b, y, x0, cw);
    }
    // sticky month title while inside a month
    const cur = this.blocks.find(
      (b) => b.t === 'head' && b.y - st < 0 && b.y + b.h - st < 0 && this.monthEnd(b.mo) - st > 60,
    );
    if (cur) {
      ctx.fillStyle = C.panel;
      ctx.fillRect(0, 0, W, 26);
      ctx.fillStyle = C.hair;
      ctx.fillRect(0, 26, W, 1);
      text(`${MONL[cur.mo.m - 1]} ${cur.mo.y}`, this.PAD, 13, 13, C.ink, 'left', 700);
      for (let d = 0; d < 7; d++)
        text(WD3[d], x0 + d * cw + cw / 2, 13, 10.5, d >= 5 ? C.ink : C.ink3, 'center', 600);
    }
  }

  monthEnd(mo: Month): number {
    let e = 0;
    for (const b of this.blocks) if (b.mo === mo) e = Math.max(e, b.y + b.h);
    return e;
  }

  drawHead(mo: Month, y: number, x0: number, cw: number): void {
    const { nights, maxMF } = atlas();
    text(`${MONL[mo.m - 1]}`, this.PAD, y + 22, 21, C.ink, 'left', 700);
    const tw1 = tw(`${MONL[mo.m - 1]}`, 21, 700);
    text(`${mo.y}`, this.PAD + tw1 + 8, y + 24, 14, C.ink3, 'left', 500);
    const nmTxt = mo.nm.map((i) => `${WD3[nights[i].dow]} ${nights[i].d}`).join(', ') || '—';
    const fmTxt = mo.fm.map((i) => `${WD3[nights[i].dow]} ${nights[i].d}`).join(', ') || '—';
    const line = `${Math.round(mo.total / MS_H)}h moon-free dark · ${mo.good} nights ≥ 4h · New moon ${nmTxt} · Full ${fmTxt}`;
    text(line, this.PAD, y + 46, 11.5, C.ink2, 'left', 500);
    // sparkline of moon-free hours across the month (one column per night)
    const sw = Math.min(7 * cw * 0.42, 300),
      sx = x0 + 7 * cw - sw,
      sh = 30,
      sy = y + 12;
    const nN = mo.idx.length,
      bw = sw / nN;
    ctx.fillStyle = C.hair;
    ctx.fillRect(sx, sy + sh, sw, 1);
    mo.idx.forEach((i, k) => {
      const n = nights[i],
        hgt = (sh * n.mfMs) / maxMF;
      const wk = n.dow === 5 || n.dow === 6;
      ctx.fillStyle = C.good;
      ctx.globalAlpha = wk ? 1 : 0.45;
      ctx.fillRect(sx + k * bw + 0.5, sy + sh - hgt, Math.max(1, bw - 1.5), hgt);
      ctx.globalAlpha = 1;
      if (n.quarter === 0) moonGlyph(n, sx + k * bw + bw / 2, sy + sh + 8, 3.5);
      if (n.quarter === 2) moonGlyph(n, sx + k * bw + bw / 2, sy + sh + 8, 3.5);
    });
    text('Moon-free hours per night (weekends solid)', sx, sy - 5, 9.5, C.ink3, 'left', 500);
  }

  drawWd(y: number, x0: number, cw: number): void {
    for (let d = 0; d < 7; d++)
      text(WD3[d], x0 + d * cw + cw / 2, y + 10, 10.5, d >= 5 ? C.ink : C.ink3, 'center', 600);
  }

  drawWeek(b: WeekBlock, y: number, x0: number, cw: number): void {
    const { nights, ax, tonightIdx } = atlas();
    const { mo, wk, wi } = b;
    const v = S.calOrient === 'v';
    const expanded = S.expandedWeek === this.weekKey(mo, wi);
    const compact = !expanded && b.h <= 66;
    const g = 2;
    // gutter: expand affordance + hour labels
    const gx = this.PAD,
      gw = this.GUT - 6;
    const hovG = S.hover != null && S.hover.gutter === this.weekKey(mo, wi);
    ctx.fillStyle = expanded || hovG ? C.chip : 'transparent';
    roundRect(gx, y + 2, gw, b.h - 4, 5);
    ctx.fill();
    chevron(gx + gw / 2, y + 11, expanded, hovG || expanded ? C.ink : C.ink3);
    const headH = compact ? 15 : 19,
      footH = compact ? 0 : v ? 18 : 34;
    const bodyY = y + headH,
      bodyH = b.h - headH - footH - g;
    if (v && !compact && cw > 50) {
      // hour labels for the vertical time axis
      const span = ax.end - ax.start;
      for (const t of hourTicks((bodyH / span) * 1.6)) {
        if (!t.major && !t.midnight) continue;
        const ty = bodyY + ((t.hh - ax.start) / span) * bodyH;
        if (ty < bodyY + 16) continue;
        text(
          t.label,
          gx + gw / 2,
          ty,
          9,
          t.midnight ? C.ink2 : C.ink3,
          'center',
          t.midnight ? 650 : 500,
        );
      }
    }
    for (let d = 0; d < 7; d++) {
      const i = wk[d];
      const cx = x0 + d * cw,
        cwi = cw - g;
      if (i < 0) continue;
      const n = nights[i];
      const inFocus = S.focus > 0 && Math.abs(n.nmOff) <= S.focus;
      const dimmed = S.focus > 0 && !inFocus;
      // cell background
      ctx.fillStyle = C.raised;
      ctx.fillRect(cx, y, cwi, b.h - g);
      if (n.dow === 5 || n.dow === 6) {
        ctx.fillStyle = C.weekend;
        ctx.fillRect(cx, y, cwi, headH);
      }
      // header: day number + moon
      const dn = n.d === 1 ? `${MON3[n.m - 1]} 1` : `${n.d}`;
      text(
        dn,
        cx + 5,
        y + headH / 2 + 0.5,
        compact ? 10.5 : 12,
        dimmed ? C.ink3 : C.ink,
        'left',
        650,
      );
      if (cwi > 70 && !compact) {
        moonGlyph(n, cx + cwi - 10, y + headH / 2, 5);
        text(
          `${Math.round(n.illum * 100)}%`,
          cx + cwi - 19,
          y + headH / 2 + 0.5,
          10,
          C.ink3,
          'right',
          500,
        );
      } else if (cwi > 40) moonGlyph(n, cx + cwi - 9, y + headH / 2, compact ? 4 : 5);
      // the night itself
      if (v) {
        drawNight(n, cx, bodyY, cwi, bodyH, 'v', {
          dim: dimmed,
          labels: expanded || (inFocus && cwi >= 60),
        });
        if (expanded) this.expandedDetails(n, cx, bodyY, cwi, bodyH);
      } else {
        const bh = expanded ? 64 : compact ? Math.max(10, b.h - headH - 8) : 22;
        drawNight(n, cx + 4, bodyY + 3, cwi - 8, bh, 'h', {
          dim: dimmed,
          curve: expanded,
          labels: expanded,
          labelY: bodyY + 3 + 10,
        });
        if (expanded) {
          const facts = nightFacts(n);
          facts.forEach((f, k) =>
            text(f, cx + 5, bodyY + 128 + k * 16, 10.5, k === 0 ? C.ink2 : C.ink3, 'left', 500),
          );
        }
      }
      // footer: moon-free hours + window
      if (!compact) {
        const fy = v ? y + b.h - g - footH / 2 : bodyY + (expanded ? 84 : 36);
        const mfTxt = n.mfMs ? fmtDur(n.mfMs) : n.tdMs ? 'Moon all night' : 'No true dark';
        if (n.mfMs) {
          ctx.fillStyle = dimmed ? C.ink3 : C.good;
          ctx.fillRect(cx + 5, fy - 3.5, 7, 7);
        }
        text(
          mfTxt,
          cx + (n.mfMs ? 16 : 5),
          fy,
          v ? 11.5 : 13,
          n.mfMs ? (dimmed ? C.ink3 : C.ink) : C.ink3,
          'left',
          650,
        );
        if (n.mfH.length) {
          const win = `${fmtClockS(n.mfH[0][0])}–${fmtClockS(n.mfH[n.mfH.length - 1][1])}`;
          if (v) {
            if (cwi > 118) text(win, cx + cwi - 5, fy, 10, C.ink3, 'right', 500);
          } else text(win, cx + 5, fy + 15, 10.5, C.ink3, 'left', 500);
        }
      }
      if (i === tonightIdx) {
        ctx.strokeStyle = C.now;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 1, y + 1, cwi - 2, b.h - g - 2);
      }
      if (i === S.sel) {
        ctx.strokeStyle = C.select;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(cx + 1.25, y + 1.25, cwi - 2.5, b.h - g - 2.5);
      } else if (S.hover && S.hover.i === i) {
        ctx.strokeStyle = C.hair2;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx + 0.75, y + 0.75, cwi - 1.5, b.h - g - 1.5);
      }
    }
  }

  /** Sunset and sunrise on the day color; moonrise and moonset when inside the night and not a window edge. */
  expandedDetails(n: Night, cx: number, y: number, w: number, h: number): void {
    const { ax } = atlas();
    const span = ax.end - ax.start;
    const Y = (hh: number) => y + ((hh - ax.start) / span) * h;
    const dayInk = inkOn(C.day);
    const E = n.evH;
    if (E.sunset != null)
      text(
        `sunset ${fmtClockS(E.sunset)}`,
        cx + w / 2,
        Y(E.sunset) - 7,
        9.5,
        dayInk,
        'center',
        600,
      );
    if (E.sunrise != null)
      text(
        `sunrise ${fmtClockS(E.sunrise)}`,
        cx + w / 2,
        Y(E.sunrise) + 8,
        9.5,
        dayInk,
        'center',
        600,
      );
    const edges = n.mfH.flat();
    const moonEvents: Array<[number | null, 'moonrise' | 'moonset']> = [
      [n.moonRise, 'moonrise'],
      [n.moonSet, 'moonset'],
    ];
    for (const [t, lab] of moonEvents) {
      if (t == null || E.sunset == null || E.sunrise == null) continue;
      const hh = wallH(t, n);
      if (hh < E.sunset || hh > E.sunrise || edges.some((e) => Math.abs(e - hh) < 0.1)) continue;
      ctx.fillStyle = `rgba(${C.moon},0.9)`;
      ctx.fillRect(cx, snap(Y(hh)), w, 1);
      text(
        `${lab} ${fmtClockS(hh)}`,
        cx + w / 2,
        Y(hh) + (lab === 'moonrise' ? -7 : 8),
        9.5,
        inkOn(skyColorAt(n, hh)),
        'center',
        600,
      );
    }
  }

  drawYear(st: number): void {
    const { nights, tonightIdx } = atlas();
    const { cw, ch } = this.yr;
    for (const b of this.blocks) {
      if (b.t !== 'mini') continue;
      const y = b.y - st;
      if (y + b.h < 0 || y > size.H) continue;
      const mo = b.mo;
      text(`${MONL[mo.m - 1]} ${mo.y}`, b.x, y + 11, 13, C.ink, 'left', 700);
      text(`${Math.round(mo.total / MS_H)}h`, b.x + b.w - 2, y + 11, 11, C.ink3, 'right', 600);
      ctx.fillStyle = C.weekend;
      roundRect(b.x + 5 * cw - 2, y + 24, 2 * cw + 1, 20 + mo.weeks.length * ch, 5);
      ctx.fill();
      for (let d = 0; d < 7; d++)
        text(WD1[d], b.x + d * cw + cw / 2, y + 32, 9, d >= 5 ? C.ink2 : C.ink3, 'center', 600);
      mo.weeks.forEach((wk, wi) => {
        wk.forEach((i, d) => {
          if (i < 0) return;
          const n = nights[i];
          const cx = b.x + d * cw,
            cy = y + 42 + wi * ch;
          const dimmed = S.focus > 0 && Math.abs(n.nmOff) > S.focus;
          drawNight(n, cx, cy + 11, cw - 2, ch - 13, 'v', { dim: dimmed });
          text(
            `${n.d}`,
            cx + 1,
            cy + 5,
            8.5,
            n.dow >= 5 ? C.ink : C.ink3,
            'left',
            n.dow >= 5 ? 700 : 500,
          );
          if (n.quarter === 0 || n.quarter === 2) moonGlyph(n, cx + cw - 7, cy + 5, 3.2);
          if (i === S.sel) {
            ctx.strokeStyle = C.select;
            ctx.lineWidth = 2;
            ctx.strokeRect(cx - 1, cy - 1, cw, ch);
          }
          if (i === tonightIdx) {
            ctx.strokeStyle = C.now;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx - 0.5, cy + 10.5, cw - 1, ch - 12);
          }
        });
      });
    }
  }

  hit(px: number, py: number): Hit | null {
    const st = scroller.scrollTop,
      cy = py + st;
    if (S.calZoom === 'year') {
      const { cw, ch } = this.yr;
      for (const b of this.blocks) {
        if (b.t !== 'mini') continue;
        if (px < b.x || px > b.x + b.w || cy < b.y || cy > b.y + b.h) continue;
        const wi = Math.floor((cy - b.y - 42) / ch),
          d = Math.floor((px - b.x) / cw);
        if (wi < 0 || wi >= b.mo.weeks.length || d < 0 || d > 6) return null;
        const i = b.mo.weeks[wi][d];
        return i >= 0 ? { i } : null;
      }
      return null;
    }
    const { x0, cw } = this.cols();
    for (const b of this.blocks) {
      if (b.t !== 'week' || cy < b.y || cy >= b.y + b.h) continue;
      if (px >= this.PAD && px < this.PAD + this.GUT - 6)
        return { gutter: this.weekKey(b.mo, b.wi) };
      const d = Math.floor((px - x0) / cw);
      if (d < 0 || d > 6) return null;
      const i = b.wk[d];
      return i >= 0 ? { i } : null;
    }
    return null;
  }
}

export const calendar = new CalendarView();
