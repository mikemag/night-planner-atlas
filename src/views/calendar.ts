import { S, atlas } from '../app/state';
import { MON3, MONL, WD1, WD3, fmtDur, fmtHrs } from '../model/format';
import type { Month } from '../model/range';
import { MS_H } from '../model/time';
import { C } from '../render/colors';
import { drawNight, hourTicks, moonGlyph } from '../render/night-draw';
import { ctx, size, text, tw } from '../render/surface';
import { scroller } from '../ui/dom';
import {
  durationScale,
  placeCalendarHeaders,
  prepareCalendarHeaders,
  type CalendarHeading,
} from '../ui/calendar-headers';
import {
  NIGHT_DETAIL_HEIGHT,
  drawNightDetail,
  nightDetailGeometry,
  placeNightDetail,
  prepareNightDetail,
} from '../ui/night-detail';
import type { CanvasView, Hit } from './view';

type WeekBlock = {
  t: 'week';
  mo: Month;
  wk: number[];
  wi: number;
  key: string;
  y: number;
  h: number;
  base: number;
};
type Block =
  | WeekBlock
  | { t: 'head'; mo: Month; y: number; h: number }
  | { t: 'mini'; mo: Month; x: number; y: number; w: number; h: number };
interface CalendarAnchor {
  key: string;
  type: Block['t'];
  fraction: number;
}

/** Familiar Sunday-first weeks, with one full-width selected-night timeline. */
class CalendarView implements CanvasView {
  PAD = 8;
  GUT = 40;
  TOP = 42;
  DATE = 24;
  FOOT = 26;
  GAP = 10;
  total = 0;
  blocks: Block[] = [];
  headings: CalendarHeading[] = [];
  yr = { cols: 4, mw: 0, cw: 0, ch: 0, gap: 18, head: 70 };

  weekKey(mo: Month, wi: number): string {
    return `${mo.key}:${wi}`;
  }
  weekHeight(): number {
    return S.calOrient === 'v' ? 176 : 102;
  }
  cols() {
    return { x0: this.PAD + this.GUT, cw: (size.W - this.PAD * 2 - this.GUT) / 7 };
  }
  displayedWeeks(mo: Month): number[][] {
    const r = atlas(),
      start = mo.idx[0] - r.nights[mo.idx[0]].dow;
    return mo.weeks.map((_, wi) =>
      Array.from({ length: 7 }, (_, d) => {
        const i = start + wi * 7 + d;
        return i >= 0 && i < r.nights.length ? i : -1;
      }),
    );
  }

  layout(): void {
    this.blocks = [];
    this.headings = [];
    if (S.calZoom === 'year') {
      this.layoutYear();
      return;
    }
    const r = atlas();
    let key = S.calendarWeek;
    const preferred = key ? r.months.find((m) => m.key === key!.split(':')[0]) : null;
    const wi = key ? Number(key.split(':')[1]) : -1;
    if (!preferred || !this.displayedWeeks(preferred)[wi]?.includes(S.sel)) {
      const own = r.months.find((m) => m.idx.includes(S.sel));
      key = own
        ? this.weekKey(
            own,
            own.weeks.findIndex((w) => w.includes(S.sel)),
          )
        : null;
    }
    S.calendarWeek = key;
    let y = 8;
    const head = size.W < 650 ? 180 : 112;
    for (const mo of r.months) {
      const b = { t: 'head' as const, mo, y, h: head };
      this.blocks.push(b);
      this.headings.push(b);
      y += head;
      this.displayedWeeks(mo).forEach((wk, wi) => {
        const base = this.weekHeight(),
          k = this.weekKey(mo, wi);
        const h = base + (S.calendarExpanded && k === key ? NIGHT_DETAIL_HEIGHT : 0);
        this.blocks.push({ t: 'week', mo, wk, wi, key: k, y, h, base });
        y += h;
      });
      y += 18;
    }
    this.total = this.TOP + y + 8;
    prepareCalendarHeaders(r, this.headings, size.W);
    prepareNightDetail(
      'calendarDetail',
      S.calendarExpanded ? (r.nights[S.sel] ?? null) : null,
      nightDetailGeometry(),
    );
  }

  layoutYear(): void {
    const r = atlas(),
      W = size.W;
    const cols = W >= 1100 ? 4 : W >= 720 ? 3 : 2,
      gap = 18,
      mw = (W - this.PAD * 2 - gap * (cols - 1)) / cols;
    const cw = mw / 7,
      ch = Math.min(34, cw * 1.35),
      head = W < 350 ? 108 : W < 650 ? 88 : 70;
    this.yr = { cols, mw, cw, ch, gap, head };
    let y = 8;
    for (let k = 0; k < r.months.length; k += cols) {
      const months = r.months.slice(k, k + cols),
        weeks = Math.max(...months.map((m) => m.weeks.length));
      const h = head + 20 + weeks * ch + 12;
      months.forEach((mo, j) => {
        const b = { t: 'mini' as const, mo, x: this.PAD + j * (mw + gap), y, w: mw, h };
        this.blocks.push(b);
        this.headings.push({ ...b, h: head });
      });
      y += h + 18;
    }
    this.total = y + 8;
    prepareCalendarHeaders(r, this.headings, W);
    prepareNightDetail('calendarDetail', null, nightDetailGeometry());
  }

  weekFor(i: number, key: string | null = S.calendarWeek): WeekBlock | undefined {
    const weeks = this.blocks.filter((b): b is WeekBlock => b.t === 'week');
    return (
      weeks.find((b) => b.key === key && b.wk.includes(i)) ??
      weeks.find((b) => b.mo.idx.includes(i) && b.wk.includes(i))
    );
  }
  topNight(): number {
    const st = scroller.scrollTop;
    return this.blocks.find((b) => b.y + b.h > st)?.mo.idx[0] ?? 0;
  }
  anchor(): CalendarAnchor | null {
    const st = scroller.scrollTop,
      b = this.blocks.find((b) => b.y + b.h > st);
    return b
      ? { key: b.t === 'week' ? b.key : b.mo.key, type: b.t, fraction: (st - b.y) / b.h }
      : null;
  }
  restoreAnchor(a: CalendarAnchor): void {
    const b = this.blocks.find(
      (b) => b.t === a.type && (b.t === 'week' ? b.key : b.mo.key) === a.key,
    );
    if (b) scroller.scrollTop = b.y + a.fraction * b.h;
  }
  scrollTo(i: number, top: boolean): void {
    if (S.calZoom === 'year') {
      const b = this.blocks.find((b) => b.t === 'mini' && b.mo.idx.includes(i));
      if (b && (top || b.y < scroller.scrollTop || b.y + b.h > scroller.scrollTop + size.H))
        scroller.scrollTop = b.y;
      return;
    }
    const b = this.weekFor(i);
    if (!b) return;
    if (top) {
      const head = this.blocks.find((x) => x.t === 'head' && x.mo === b.mo)!;
      scroller.scrollTop = head.y;
    }
    this.reveal(i);
  }
  reveal(i: number): void {
    const b = this.weekFor(i);
    if (!b) return;
    const available = size.H - this.TOP,
      bottom = b.y + b.h;
    const expanded = S.calendarExpanded && i === S.sel;
    if (expanded) {
      if (
        bottom > scroller.scrollTop + available ||
        bottom < scroller.scrollTop + NIGHT_DETAIL_HEIGHT
      )
        scroller.scrollTop = Math.max(b.y, bottom - available);
    } else if (b.y < scroller.scrollTop || bottom > scroller.scrollTop + available)
      scroller.scrollTop = Math.max(0, b.y - Math.max(0, (available - b.base) / 2));
  }

  draw(st: number): void {
    if (S.calZoom === 'year') {
      this.drawYear(st);
      return;
    }
    const { W, H } = size,
      { x0, cw } = this.cols(),
      r = atlas();
    placeCalendarHeaders(this.headings, st, W, this.TOP);
    const selected = this.weekFor(S.sel);
    if (S.calendarExpanded && selected)
      placeNightDetail('calendarDetail', this.TOP + selected.y + selected.base, st, 0, W, this.TOP);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, this.TOP, W, H - this.TOP);
    ctx.clip();
    for (const b of this.blocks) {
      if (b.t !== 'week') continue;
      const y = this.TOP + b.y - st;
      if (y + b.h < this.TOP) continue;
      if (y > H) break;
      this.drawWeek(b, y, x0, cw);
      if (S.calendarExpanded && b.key === S.calendarWeek) {
        const n = r.nights[S.sel];
        if (n) drawNightDetail(n, y + b.base);
        const d = b.wk.indexOf(S.sel),
          x = x0 + (d + 0.5) * cw;
        ctx.fillStyle = C.select;
        ctx.beginPath();
        ctx.moveTo(x - 5, y + b.base - 7);
        ctx.lineTo(x + 5, y + b.base - 7);
        ctx.lineTo(x, y + b.base - 1);
        ctx.fill();
      }
    }
    ctx.restore();
    const mo = this.blocks.find((b) => b.y + b.h > st)?.mo ?? r.months[0];
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, W, this.TOP);
    text(`${MONL[mo.m - 1]} ${mo.y}`, this.PAD, 11, 11, C.ink, 'left', 650);
    text(
      S.calOrient === 'v' ? 'Evening ↓ morning' : 'Evening → morning',
      W - this.PAD,
      11,
      10,
      C.ink2,
      'right',
      500,
    );
    text(S.calOrient === 'v' ? 'Time ↓' : 'Time →', this.PAD, 31, 9, C.ink3, 'left', 500);
    for (let d = 0; d < 7; d++)
      text(
        WD3[d],
        x0 + (d + 0.5) * cw,
        31,
        10.5,
        d === 5 || d === 6 ? C.ink : C.ink3,
        'center',
        d >= 5 ? 650 : 500,
      );
    ctx.fillStyle = C.hair;
    ctx.fillRect(0, this.TOP - 1, W, 1);
  }

  drawWeek(b: WeekBlock, y: number, x0: number, cw: number): void {
    const r = atlas(),
      v = S.calOrient === 'v',
      bodyY = y + this.DATE;
    const bodyH = v ? b.base - this.DATE - this.FOOT - this.GAP : 24,
      cwi = cw - 2;
    for (let d = 0; d < 7; d++) {
      const i = b.wk[d],
        n = r.nights[i],
        cx = x0 + d * cw;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, y, cwi, b.base - this.GAP);
      ctx.clip();
      ctx.fillStyle = C.raised;
      ctx.fillRect(cx, y, cwi, b.base - this.GAP);
      if (d === 5 || d === 6) {
        ctx.fillStyle = C.weekend;
        ctx.fillRect(cx, y, cwi, this.DATE);
      }
      if (!n) {
        const firstDow = r.nights[b.mo.idx[0]].dow;
        const date = new Date(Date.UTC(b.mo.y, b.mo.m - 1, 1 - firstDow + b.wi * 7 + d));
        text(
          `${MON3[date.getUTCMonth()]} ${date.getUTCDate()}`,
          cx + cwi / 2,
          y + this.DATE / 2,
          9.5,
          C.ink3,
          'center',
          500,
        );
        text('—', cx + cwi / 2, bodyY + bodyH / 2, 14, C.ink3, 'center');
        ctx.restore();
        continue;
      }
      const neighbor = n.y !== b.mo.y || n.m !== b.mo.m;
      const dim = neighbor || (S.focus > 0 && Math.abs(n.nmOff) > S.focus);
      const date = neighbor ? `${MON3[n.m - 1]} ${n.d}` : String(n.d);
      text(date, cx + 4, y + this.DATE / 2, neighbor ? 9.5 : 12, dim ? C.ink3 : C.ink, 'left', 650);
      if (cwi > (neighbor ? 90 : 38)) {
        moonGlyph(n, cx + cwi - 8, y + this.DATE / 2, 4);
        if (cwi > 90)
          text(
            `${Math.round(n.illum * 100)}%`,
            cx + cwi - 19,
            y + this.DATE / 2,
            10,
            C.ink3,
            'right',
            500,
          );
      }
      drawNight(n, cx, bodyY, cwi, bodyH, v ? 'v' : 'h', { dim });
      const total = n.mfMs ? fmtDur(n.mfMs) : n.tdMs ? '0h' : '—';
      const label = tw(total, 11.5, 650) <= cwi - 8 ? total : n.mfMs ? `${fmtHrs(n.mfMs)}h` : total;
      const fy = v ? bodyY + bodyH + 11 : bodyY + bodyH + 16;
      text(
        label,
        cx + cwi / 2,
        fy,
        cwi < 50 ? 10 : 11.5,
        dim || !n.mfMs ? C.ink3 : C.ink,
        'center',
        650,
      );
      if (!v && cwi > 100)
        text(
          n.mfH.length > 1 ? `${n.mfH.length} separate windows` : 'usable dark',
          cx + cwi / 2,
          fy + 14,
          10,
          C.ink3,
          'center',
        );
      const barY = y + b.base - this.GAP - 3;
      ctx.fillStyle = dim ? C.ink3 : C.good;
      ctx.fillRect(cx + 4, barY, ((cwi - 8) * n.mfMs) / (durationScale(r) * MS_H), 2);
      ctx.restore();
      if (i === r.tonightIdx || (i === S.sel && b.key === S.calendarWeek)) {
        ctx.strokeStyle = i === S.sel && b.key === S.calendarWeek ? C.select : C.now;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 1, y + 1, cwi - 2, b.base - this.GAP - 2);
      } else if (S.hover?.i === i && S.hover.week === b.key) {
        ctx.strokeStyle = C.hair2;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + 0.5, y + 0.5, cwi - 1, b.base - this.GAP - 1);
      }
    }
    if (v) {
      const span = r.ax.end - r.ax.start;
      for (const tick of hourTicks((bodyH / span) * 1.6)) {
        if (!tick.major && !tick.midnight) continue;
        const ty = bodyY + ((tick.hh - r.ax.start) / span) * bodyH;
        if (ty < bodyY + 15 || ty > bodyY + bodyH - 7) continue;
        if (tick.midnight) {
          ctx.fillStyle = C.ink3;
          ctx.globalAlpha = 0.4;
          ctx.fillRect(x0, ty, 7 * cw - 2, 1);
          ctx.globalAlpha = 1;
        }
        text(
          tick.label,
          x0 - 6,
          ty,
          9,
          tick.midnight ? C.ink : C.ink3,
          'right',
          tick.midnight ? 700 : 450,
        );
      }
      text('Evening', x0 - 6, bodyY + 5, 8, C.ink2, 'right', 500);
      text('Morning', x0 - 6, bodyY + bodyH + 9, 8, C.ink2, 'right', 500);
    }
  }

  drawYear(st: number): void {
    const r = atlas(),
      { cw, ch, head } = this.yr;
    placeCalendarHeaders(this.headings, st, size.W, 0);
    for (const b of this.blocks) {
      if (b.t !== 'mini') continue;
      const y = b.y - st;
      if (y + b.h < 0 || y > size.H) continue;
      ctx.fillStyle = C.hair;
      ctx.fillRect(b.x, y, b.w, b.h);
      ctx.fillStyle = C.panel;
      ctx.fillRect(b.x + 1, y + 1, b.w - 2, b.h - 2);
      for (let d = 0; d < 7; d++)
        text(
          WD1[d],
          b.x + (d + 0.5) * cw,
          y + head + 10,
          9,
          d >= 5 ? C.ink : C.ink3,
          'center',
          600,
        );
      b.mo.weeks.forEach((wk, wi) =>
        wk.forEach((i, d) => {
          if (i < 0) return;
          const n = r.nights[i],
            x = b.x + d * cw,
            cy = y + head + 20 + wi * ch;
          if (d === 5 || d === 6) {
            ctx.fillStyle = C.weekend;
            ctx.fillRect(x, cy, cw - 2, 11);
          }
          text(String(n.d), x + 2, cy + 5, 8.5, n.dow >= 5 ? C.ink : C.ink3, 'left', 600);
          drawNight(n, x, cy + 11, cw - 2, ch - 12, 'v', {
            dim: S.focus > 0 && Math.abs(n.nmOff) > S.focus,
          });
          if (i === S.sel || i === r.tonightIdx) {
            ctx.strokeStyle = i === S.sel ? C.select : C.now;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 0.5, cy + 0.5, cw - 2, ch - 1);
          }
        }),
      );
    }
  }
  hit(px: number, py: number): Hit | null {
    const cy = py + scroller.scrollTop;
    if (S.calZoom === 'year') {
      const b = this.blocks.find(
        (b) => b.t === 'mini' && px >= b.x && px < b.x + b.w && cy >= b.y && cy < b.y + b.h,
      );
      if (!b || b.t !== 'mini') return null;
      const wi = Math.floor((cy - b.y - this.yr.head - 20) / this.yr.ch),
        d = Math.floor((px - b.x) / this.yr.cw);
      const i = b.mo.weeks[wi]?.[d];
      return { month: b.mo.key, i: i != null && i >= 0 ? i : undefined };
    }
    if (py < this.TOP) return null;
    const y = cy - this.TOP,
      { x0, cw } = this.cols();
    const b = this.blocks.find(
      (b): b is WeekBlock => b.t === 'week' && y >= b.y && y < b.y + b.base - this.GAP,
    );
    if (!b) return null;
    const d = Math.floor((px - x0) / cw);
    if (d < 0 || d > 6) return null;
    const i = b.wk[d];
    return i >= 0 ? { i, week: b.key } : null;
  }
}
export const calendar = new CalendarView();
