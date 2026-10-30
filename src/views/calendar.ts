import { S, atlas } from '../app/state';
import { MON3, MONL, WD1, WD3, fmtClockS, fmtDur, fmtHrs, pad2 } from '../model/format';
import type { Night } from '../model/night';
import type { Axis, Month } from '../model/range';
import { C, inkOn } from '../render/colors';
import { drawNight, hourTicks, moonGlyph } from '../render/night-draw';
import { ctx, size, text, tw } from '../render/surface';
import { scroller } from '../ui/dom';
import { placeCalendarHeaders, prepareCalendarHeaders } from '../ui/calendar-headers';
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
  start: number;
  wi: number;
  key: string;
  y: number;
  h: number;
  base: number;
};
export type CalendarMonthBlock = {
  t: 'mini';
  mo: Month;
  x: number;
  y: number;
  w: number;
  h: number;
};
type Block = WeekBlock | CalendarMonthBlock;

/** One complete period: quiet month summaries, seven full nights, or twelve month choosers. */
class CalendarView implements CanvasView {
  PAD = 8;
  TOP = 28;
  FOOT = 24;
  total = 0;
  blocks: Block[] = [];
  weekAxis: Axis = { start: 0, end: 24 };
  weekBody = { y: 84, h: 0 };
  yr = { cols: 4, head: 38, cw: 0, ch: 0, compact: false };
  newMoons = new Map<string, number>();

  month(): Month {
    const r = atlas(),
      n = r.nights[S.sel] ?? r.nights[0];
    return (
      r.months.find((m) => m.key === S.calendarMonth) ??
      r.months.find((m) => m.y === n.y && m.m === n.m) ??
      r.months[0]
    );
  }
  cols() {
    const x0 = S.calZoom === 'week' ? 42 : 0;
    return { x0, cw: (size.W - x0) / 7 };
  }
  weekKey(mo: Month, wi: number): string {
    return `${mo.key}:${wi}`;
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
  /** Date arithmetic uses evening dates, independently of either browser or site UTC offsets. */
  dateAt(i: number): { y: number; m: number; d: number; dow: number } {
    const first = atlas().nights[0],
      date = new Date(Date.UTC(first.y, first.m - 1, first.d + i));
    return {
      y: date.getUTCFullYear(),
      m: date.getUTCMonth() + 1,
      d: date.getUTCDate(),
      dow: date.getUTCDay(),
    };
  }
  label(): string {
    const mo = this.month();
    if (S.calZoom === 'year') return String(mo.y);
    if (S.calZoom === 'week') {
      const n = atlas().nights[S.sel] ?? atlas().nights[mo.idx[0]],
        a = this.dateAt((S.sel >= 0 ? S.sel : mo.idx[0]) - n.dow),
        b = this.dateAt((S.sel >= 0 ? S.sel : mo.idx[0]) - n.dow + 6);
      return `${MON3[a.m - 1]} ${a.d}–${a.m === b.m ? '' : MON3[b.m - 1] + ' '}${b.d}, ${b.y}`;
    }
    return `${MONL[mo.m - 1]} ${mo.y}`;
  }
  layout(): void {
    const r = atlas(),
      mo = this.month();
    S.calendarMonth = mo.key;
    this.total = size.H;
    this.blocks = [];
    this.newMoons = new Map(
      r.quarters
        .filter((q) => q.q === 0)
        .map((q) => {
          const p = r.tz.wallParts(q.t + 30_000);
          return [`${p.y}-${pad2(p.m)}-${pad2(p.d)}`, q.t];
        }),
    );
    if (S.calZoom === 'year') this.layoutYear();
    else if (S.calZoom === 'week') this.layoutWeek();
    else {
      const h = Math.max(0, (size.H - this.TOP - this.FOOT) / mo.weeks.length),
        start = mo.idx[0] - r.nights[mo.idx[0]].dow;
      this.displayedWeeks(mo).forEach((wk, wi) =>
        this.blocks.push({
          t: 'week',
          mo,
          wk,
          wi,
          start: start + wi * 7,
          key: this.weekKey(mo, wi),
          y: this.TOP + wi * h,
          h,
          base: h,
        }),
      );
    }
    const months = this.blocks.filter((b): b is CalendarMonthBlock => b.t === 'mini');
    prepareCalendarHeaders(r, months, size.W, S.calZoom === 'year' && this.yr.compact);
    placeCalendarHeaders(months);
    prepareNightDetail(
      'calendarDetail',
      S.calendarExpanded && S.calZoom !== 'year' ? (r.nights[S.sel] ?? null) : null,
      nightDetailGeometry(),
    );
    if (S.calendarExpanded && S.calZoom !== 'year')
      placeNightDetail(
        'calendarDetail',
        Math.max(0, size.H - NIGHT_DETAIL_HEIGHT),
        0,
        0,
        size.W,
        0,
      );
  }
  layoutWeek(): void {
    const r = atlas(),
      mo = this.month(),
      i = S.sel >= 0 ? S.sel : mo.idx[0],
      start = i - r.nights[i].dow,
      wk = Array.from({ length: 7 }, (_, d) =>
        start + d >= 0 && start + d < r.nights.length ? start + d : -1,
      ),
      ns = wk.filter((i) => i >= 0).map((i) => r.nights[i]),
      sets = ns.flatMap((n) => (n.evH.sunset == null ? [] : [n.evH.sunset])),
      rises = ns.flatMap((n) => (n.evH.sunrise == null ? [] : [n.evH.sunrise]));
    this.weekAxis =
      sets.length && rises.length
        ? {
            start: Math.floor(Math.min(...sets) * 2) / 2 - 0.5,
            end: Math.ceil(Math.max(...rises) * 2) / 2 + 0.5,
          }
        : r.ax;
    this.weekBody = { y: this.TOP + 56, h: Math.max(0, size.H - this.TOP - 56 - this.FOOT) };
    this.blocks.push({
      t: 'week',
      mo,
      wk,
      start,
      wi: 0,
      key: `week:${start}`,
      y: this.TOP,
      h: size.H - this.TOP - this.FOOT,
      base: size.H - this.TOP - this.FOOT,
    });
  }
  layoutYear(): void {
    const r = atlas(),
      year = this.month().y,
      cols = size.W >= 1000 ? 4 : size.W >= 650 ? 3 : 2,
      rows = 12 / cols,
      gap = size.W < 650 ? 8 : 16,
      w = (size.W - this.PAD * 2 - gap * (cols - 1)) / cols,
      h = Math.max(0, (size.H - this.FOOT - this.PAD * 2 - gap * (rows - 1)) / rows);
    this.yr = {
      cols,
      head: 38,
      cw: w / 7,
      ch: Math.max(0, Math.min(24, (h - 60) / 6)),
      compact: size.W < 650 || h < 150,
    };
    for (let m = 1; m <= 12; m++) {
      const mo = r.months.find((mo) => mo.y === year && mo.m === m);
      if (mo)
        this.blocks.push({
          t: 'mini',
          mo,
          x: this.PAD + ((m - 1) % cols) * (w + gap),
          y: this.PAD + Math.floor((m - 1) / cols) * (h + gap),
          w,
          h,
        });
    }
  }
  weekFor(i: number, key: string | null = S.calendarWeek): WeekBlock | undefined {
    const weeks = this.blocks.filter((b): b is WeekBlock => b.t === 'week');
    return (
      weeks.find((b) => b.key === key && b.wk.includes(i)) ?? weeks.find((b) => b.wk.includes(i))
    );
  }
  topNight(): number {
    return this.month().idx[0];
  }
  anchor(): string {
    return this.month().key;
  }
  restoreAnchor(key: string): void {
    if (atlas().months.some((mo) => mo.key === key) && key !== S.calendarMonth) {
      S.calendarMonth = key;
      this.layout();
    }
    scroller.scrollTop = 0;
  }
  scrollTo(i: number, top: boolean): void {
    const n = atlas().nights[i];
    if (!n) return;
    const key = `${n.y}-${pad2(n.m)}`;
    if ((S.calendarMonth !== key && (top || !this.weekFor(i))) || S.calZoom === 'week') {
      S.calendarMonth = key;
      this.layout();
    }
    scroller.scrollTop = 0;
  }
  draw(): void {
    if (S.calZoom === 'year') this.drawYear();
    else if (S.calZoom === 'week') this.drawWeek();
    else this.drawMonth();
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, size.H - this.FOOT, size.W, this.FOOT);
    text(
      S.calZoom === 'year'
        ? this.yr.compact
          ? 'New moon dates · select a month'
          : '● New moon · select a month'
        : S.calZoom === 'month'
          ? 'Usable dark · current Moon settings · ● New moon'
          : 'Usable dark · current Moon settings',
      this.PAD,
      size.H - 12,
      11,
      C.ink2,
    );
    if (size.W > 600)
      text('Evening dates · site clock time', size.W - this.PAD, size.H - 12, 11, C.ink3, 'right');
    const n = atlas().nights[S.sel];
    if (S.calendarExpanded && S.calZoom !== 'year' && n) {
      const y = Math.max(0, size.H - NIGHT_DETAIL_HEIGHT);
      ctx.fillStyle = C.panel;
      ctx.fillRect(0, y, size.W, NIGHT_DETAIL_HEIGHT);
      drawNightDetail(n, y);
    }
  }
  drawMonth(): void {
    const r = atlas(),
      { cw } = this.cols();
    WD3.forEach((day, d) => text(day, (d + 0.5) * cw, 14, 11, C.ink2, 'center'));
    for (const b of this.blocks) {
      if (b.t !== 'week') continue;
      for (let d = 0; d < 7; d++) {
        const i = b.wk[d],
          n = r.nights[i],
          date = this.dateAt(b.start + d),
          x = d * cw,
          adjacent = date.m !== b.mo.m || date.y !== b.mo.y;
        ctx.fillStyle = adjacent ? C.panel : C.raised;
        ctx.fillRect(x, b.y, cw, b.h);
        ctx.strokeStyle = C.hair2;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, b.y + 0.5, cw, b.h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, b.y, cw, b.h);
        ctx.clip();
        const marked = n && this.newMoons.has(n.id) && cw < 60 && b.h < 76;
        if (marked) {
          ctx.beginPath();
          ctx.arc(x + 14, b.y + 14, 9, 0, Math.PI * 2);
          ctx.fillStyle = C.ink;
          ctx.fill();
        }
        text(
          String(date.d),
          x + (marked ? 14 : 7),
          b.y + 14,
          12,
          marked ? inkOn(C.ink) : i >= 0 && i === r.tonightIdx ? C.now : adjacent ? C.ink3 : C.ink,
          marked ? 'center' : 'left',
          600,
        );
        if (n && !adjacent) this.drawSummary(n, x, b.y, cw, b.h);
        if (!n) text('—', x + 7, b.y + 37, 12, C.ink3);
        ctx.restore();
        this.outline(i, b, x, b.y, cw, b.h);
      }
    }
  }
  drawSummary(n: Night, x: number, y: number, w: number, h: number): void {
    const narrow = w < 85,
      isNew = this.newMoons.has(n.id),
      dim = S.focus > 0 && Math.abs(n.nmOff) > S.focus,
      ink = dim || !n.mfMs ? C.ink3 : C.ink;
    if (isNew && w >= 60 && h < 76) {
      const label = narrow ? 'New' : 'New moon',
        lw = tw(label, 10.5, 600) + 6;
      ctx.fillStyle = C.ink;
      ctx.fillRect(x + w - lw - 4, y + 6, lw, 16);
      text(label, x + w - lw / 2 - 4, y + 14, 10.5, inkOn(C.ink), 'center', 600);
    } else if (w > 38) {
      moonGlyph(n, x + w - 11, y + 14, 5);
      if (w >= 95) text(`${Math.round(n.illum * 100)}%`, x + w - 22, y + 14, 11, C.ink3, 'right');
    }
    if (S.calMonthStyle === 'hours') {
      const full = n.mfMs ? fmtDur(n.mfMs) : '0h',
        px = narrow ? 14 : 19,
        label = tw(full, px, 600) <= w - 12 ? full : `${fmtHrs(n.mfMs)}h`;
      text(label, x + 7, y + (narrow ? 37 : 46), px, ink, 'left', 600);
    } else if (n.mfH.length === 1) {
      const [start, end] = n.mfH[0],
        range = `${fmtClockS(start)}–${fmtClockS(end)}`;
      if (tw(range, 14, 600) <= w - 12) text(range, x + 7, y + 43, 14, ink, 'left', 600);
      else {
        text(fmtClockS(start), x + 5, y + 32, 11, ink, 'left', 600);
        text(fmtClockS(end), x + 5, y + 47, 11, ink, 'left', 600);
      }
    } else {
      const full = n.mfH.length ? `${n.mfH.length} windows` : 'No usable dark',
        px = narrow ? 11 : 14;
      text(
        tw(full, px, 600) <= w - 14 ? full : n.mfH.length ? 'Split' : '0h',
        x + 7,
        y + 39,
        px,
        ink,
        'left',
        600,
      );
    }
    if (S.calMonthStyle === 'windows' && !narrow && h >= 92 && (!isNew || h >= 96))
      text(`${fmtDur(n.mfMs)} usable`, x + 7, y + 66, 11, C.ink2);
    if (isNew && h >= 76) {
      const label = narrow ? 'New' : 'New moon',
        lw = tw(label, 11, 600) + 8,
        ly = S.calMonthStyle === 'windows' && h >= 96 ? 84 : 65;
      ctx.fillStyle = C.ink;
      ctx.fillRect(x + 7, y + ly - 8, lw, 16);
      text(label, x + 11, y + ly, 11, inkOn(C.ink), 'left', 600);
    }
  }
  outline(i: number, b: WeekBlock, x: number, y: number, w: number, h: number): void {
    if (i < 0) return;
    if (i === S.sel || (S.hover?.i === i && (!S.hover.week || S.hover.week === b.key))) {
      ctx.strokeStyle = i === S.sel ? C.select : C.ink3;
      ctx.lineWidth = i === S.sel ? 2 : 1;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }
  drawWeek(): void {
    const b = this.blocks[0];
    if (!b || b.t !== 'week') return;
    const r = atlas(),
      { x0, cw } = this.cols(),
      { y, h } = this.weekBody,
      span = this.weekAxis.end - this.weekAxis.start;
    text('Evening ↓ morning', size.W - this.PAD, 14, 11, C.ink2, 'right');
    for (let d = 0; d < 7; d++) {
      const i = b.wk[d],
        n = r.nights[i],
        date = this.dateAt(b.start + d),
        x = x0 + d * cw;
      text(WD3[d], x + cw / 2, b.y + 9, 11, C.ink2, 'center');
      text(
        date.d === 1 ? `${MON3[date.m - 1]} 1` : String(date.d),
        x + cw / 2,
        b.y + 25,
        12,
        i >= 0 && i === r.tonightIdx ? C.now : C.ink,
        'center',
        600,
      );
      if (n) {
        const full = n.mfMs ? fmtDur(n.mfMs) : '0h',
          label = tw(full, 12, 600) < cw - 6 ? full : `${fmtHrs(n.mfMs)}h`;
        text(label, x + cw / 2, b.y + 44, 12, n.mfMs ? C.ink : C.ink3, 'center', 600);
        drawNight(n, x + 1, y, cw - 2, h, 'v', {
          axis: this.weekAxis,
          dim: S.focus > 0 && Math.abs(n.nmOff) > S.focus,
        });
        const P = (t: number) => y + ((t - this.weekAxis.start) / span) * h;
        for (const [start, end] of n.mfH) {
          for (const t of [start, end]) {
            ctx.fillStyle = C.good;
            ctx.fillRect(x + 4, P(t), cw - 8, 1.5);
          }
          if (P(end) - P(start) < 36) continue;
          for (const [t, offset] of [
            [start, 11],
            [end, -9],
          ]) {
            const label = fmtClockS(t),
              lw = tw(label, 11, 600) + 4,
              ly = P(t) + offset;
            if (lw > cw - 2) continue;
            ctx.fillStyle = C.panel;
            ctx.fillRect(x + (cw - lw) / 2, ly - 7, lw, 14);
            text(label, x + cw / 2, ly, 11, inkOn(C.panel), 'center', 600);
          }
        }
      }
      ctx.fillStyle = C.hair2;
      ctx.fillRect(x, y, 1, h);
      this.outline(i, b, x, b.y, cw, b.h);
    }
    for (const tick of hourTicks(h / span, this.weekAxis)) {
      if (!tick.major && !tick.midnight) continue;
      const ty = y + ((tick.hh - this.weekAxis.start) / span) * h;
      if (ty < y + 12 || ty > y + h - 12) continue;
      if (tick.midnight) {
        ctx.fillStyle = C.ink3;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(x0, ty, size.W - x0, 1);
        ctx.globalAlpha = 1;
      }
      text(tick.label, x0 - 6, ty, 11, C.ink2, 'right');
    }
  }
  drawYear(): void {
    const r = atlas(),
      { cw, ch, head } = this.yr;
    for (const b of this.blocks) {
      if (b.t !== 'mini') continue;
      ctx.fillStyle = C.raised;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (b.mo.idx.includes(S.sel)) {
        ctx.strokeStyle = C.select;
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      }
      if (this.yr.compact) continue;
      WD1.forEach((day, d) =>
        text(day, b.x + (d + 0.5) * cw, b.y + head + 8, 11, C.ink2, 'center'),
      );
      b.mo.weeks.forEach((wk, wi) =>
        wk.forEach((i, d) => {
          if (i < 0) return;
          const n = r.nights[i],
            x = b.x + (d + 0.5) * cw,
            y = b.y + head + 20 + (wi + 0.5) * ch,
            isNew = this.newMoons.has(n.id);
          if (isNew) {
            ctx.beginPath();
            ctx.arc(x, y, 9, 0, Math.PI * 2);
            ctx.fillStyle = C.ink;
            ctx.fill();
          }
          text(
            String(n.d),
            x,
            y,
            11,
            isNew ? inkOn(C.ink) : i === r.tonightIdx ? C.now : C.ink,
            'center',
          );
        }),
      );
    }
  }
  hit(px: number, py: number): Hit | null {
    if (S.calZoom === 'year') {
      const b = this.blocks.find(
        (b) => b.t === 'mini' && px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h,
      );
      return b ? { month: b.mo.key } : null;
    }
    if (S.calendarExpanded && py >= size.H - NIGHT_DETAIL_HEIGHT) return null;
    const { x0, cw } = this.cols(),
      d = Math.floor((px - x0) / cw),
      b = this.blocks.find((b): b is WeekBlock => b.t === 'week' && py >= b.y && py < b.y + b.h);
    if (!b || d < 0 || d > 6 || b.wk[d] < 0) return null;
    return { i: b.wk[d], week: b.key };
  }
}
export const calendar = new CalendarView();
