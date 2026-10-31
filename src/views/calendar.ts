import { S, atlas } from '../app/state';
import { MON3, MONL, WD1, WD3, fmtClockS, fmtDur, fmtHrs, pad2 } from '../model/format';
import type { Night } from '../model/night';
import type { Axis, Month } from '../model/range';
import { MS_H } from '../model/time';
import { C, inkOn } from '../render/colors';
import { drawDurationBar, usableHoursScale } from '../render/duration';
import { calendarEvents, calendarEventLabels } from '../render/calendar-events';
import { drawNight, hourTicks, moonGlyph } from '../render/night-draw';
import { ctx, size, text, tw } from '../render/surface';
import { scroller } from '../ui/dom';
import {
  placeCalendarHeaders,
  prepareCalendarHeaders,
  prepareCalendarPeriods,
  type CalendarPeriodHeading,
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
  start: number;
  wi: number;
  key: string;
  y: number;
  h: number;
  base: number;
  axis?: Axis;
  body?: { y: number; h: number };
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
type Period = { key: string; i: number; mo: Month; y: number; h: number; base: number };
type CalendarAnchor = { key: string; offset: number };

/** Continuous months/weeks, with expansions reserving their own space in the date sequence. */
class CalendarView implements CanvasView {
  PAD = 8;
  TOP = 32;
  FOOT = 24;
  GAP = 18;
  total = 0;
  blocks: Block[] = [];
  periods: Period[] = [];
  headings: CalendarPeriodHeading[] = [];
  weekAxis: Axis = { start: 0, end: 24 };
  weekBody = { y: 88, h: 0 };
  yr = { cols: 4, head: 46, cw: 0, ch: 0, compact: false };
  newMoons = new Map<string, number>();
  annotations: Array<{
    i: number;
    name: string;
    time: string;
    y: number;
    anchor: number;
    x: number;
    w: number;
    leader: boolean;
  }> = [];
  detailTop: number | null = null;

  scale(): number {
    return usableHoursScale(atlas().maxMF);
  }
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
  dateAt(i: number) {
    const n = atlas().nights[0],
      d = new Date(Date.UTC(n.y, n.m - 1, n.d + i));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
  }
  weekLabel(start: number): string {
    const a = this.dateAt(start),
      b = this.dateAt(start + 6);
    return `${MON3[a.m - 1]} ${a.d}–${a.m === b.m ? '' : MON3[b.m - 1] + ' '}${b.d}, ${b.y}`;
  }
  active(): Period | undefined {
    return this.periods.find((p) => p.y + p.h > scroller.scrollTop + 1) ?? this.periods.at(-1);
  }
  label(): string {
    if (S.calZoom === 'year') {
      const months = atlas().months,
        first = months[0].y,
        last = months.at(-1)!.y;
      return first === last ? String(first) : `${first}–${last}`;
    }
    const p = this.active();
    return p
      ? S.calZoom === 'week'
        ? this.weekLabel(p.i - atlas().nights[p.i].dow)
        : `${MONL[p.mo.m - 1]} ${p.mo.y}`
      : '—';
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
    const r = atlas();
    this.blocks = [];
    this.periods = [];
    this.headings = [];
    this.detailTop = null;
    this.newMoons = new Map(
      r.quarters
        .filter((q) => q.q === 0)
        .map((q) => {
          const p = r.tz.wallParts(q.t + 30_000);
          return [`${p.y}-${pad2(p.m)}-${pad2(p.d)}`, q.t];
        }),
    );
    if (S.calZoom === 'year') this.layoutYear();
    else if (S.calZoom === 'week') this.layoutWeeks();
    else this.layoutMonths();
    if (S.calZoom !== 'year') S.calendarWeek = this.weekFor(S.sel)?.key ?? null;
    const minis = this.blocks.filter((b): b is CalendarMonthBlock => b.t === 'mini');
    if (S.calZoom === 'year') {
      prepareCalendarHeaders(r, minis, size.W, this.yr.compact);
      placeCalendarHeaders(minis);
    } else prepareCalendarPeriods(r, this.headings, size.W);
    prepareNightDetail(
      'calendarDetail',
      this.detailTop != null ? (r.nights[S.sel] ?? null) : null,
      nightDetailGeometry(),
    );
    if (this.detailTop != null)
      placeNightDetail('calendarDetail', this.detailTop, scroller.scrollTop, 0, size.W, 0);
  }
  expansionKey(): string | null {
    if (!S.calendarExpanded || S.calZoom === 'year') return null;
    const r = atlas(),
      own = r.months.find((mo) => mo.idx.includes(S.sel));
    if (!own) return null;
    if (S.calZoom === 'week') return `week:${S.sel - r.nights[S.sel].dow}`;
    const requested = S.calendarWeek?.split(':');
    const mo = r.months.find((mo) => mo.key === requested?.[0]);
    if (mo && this.displayedWeeks(mo)[Number(requested?.[1])]?.includes(S.sel))
      return S.calendarWeek;
    return this.weekKey(
      own,
      own.weeks.findIndex((wk) => wk.includes(S.sel)),
    );
  }
  layoutMonths(): void {
    const r = atlas(),
      expanded = this.expansionKey();
    let y = 0;
    for (const mo of r.months) {
      const top = y,
        rowH = Math.max(78, (size.H - this.TOP - 22 - this.FOOT) / mo.weeks.length),
        start = mo.idx[0] - r.nights[mo.idx[0]].dow;
      this.headings.push({
        key: mo.key,
        title: `${MONL[mo.m - 1]} ${mo.y}`,
        context: `${fmtDur(mo.total)} usable`,
        y,
        h: this.TOP,
      });
      y += this.TOP + 22;
      this.displayedWeeks(mo).forEach((wk, wi) => {
        const key = this.weekKey(mo, wi),
          h = rowH + (key === expanded ? NIGHT_DETAIL_HEIGHT : 0);
        this.blocks.push({ t: 'week', mo, wk, wi, start: start + wi * 7, key, y, h, base: rowH });
        if (key === expanded) {
          this.detailTop = y + rowH;
          S.calendarWeek = key;
        }
        y += h;
      });
      y += this.FOOT;
      this.periods.push({
        key: mo.key,
        i: mo.idx[0],
        mo,
        y: top,
        h: y - top,
        base: y - top - (expanded?.startsWith(mo.key + ':') ? NIGHT_DETAIL_HEIGHT : 0),
      });
      y += this.GAP;
    }
    this.total = y - this.GAP;
  }
  layoutWeeks(): void {
    const r = atlas(),
      expanded = this.expansionKey();
    let y = 0;
    for (let start = -r.nights[0].dow; start < r.nights.length; start += 7) {
      const wk = Array.from({ length: 7 }, (_, d) =>
          start + d >= 0 && start + d < r.nights.length ? start + d : -1,
        ),
        ns = wk.filter((i) => i >= 0).map((i) => r.nights[i]),
        i = wk.find((i) => i >= 0)!,
        mo = r.months.find((mo) => mo.idx.includes(i))!,
        sets = ns.flatMap((n) => (n.evH.sunset == null ? [] : [n.evH.sunset])),
        rises = ns.flatMap((n) => (n.evH.sunrise == null ? [] : [n.evH.sunrise])),
        axis =
          sets.length && rises.length
            ? {
                start: Math.floor(Math.min(...sets) * 2) / 2 - 0.5,
                end: Math.ceil(Math.max(...rises) * 2) / 2 + 0.5,
              }
            : r.ax,
        skyH = Math.max(
          size.H - this.TOP - 56 - this.FOOT,
          Math.max(...ns.map((n) => calendarEvents(n).length)) * 22 + 16,
        ),
        base = this.TOP + 56 + skyH + this.FOOT,
        key = `week:${start}`,
        h = base + (key === expanded ? NIGHT_DETAIL_HEIGHT : 0);
      this.headings.push({
        key,
        title: this.weekLabel(start),
        context: 'Evening ↓ morning',
        y,
        h: this.TOP,
      });
      this.blocks.push({
        t: 'week',
        mo,
        wk,
        start,
        wi: 0,
        key,
        y: y + this.TOP,
        h: h - this.TOP,
        base: base - this.TOP,
        axis,
        body: { y: y + this.TOP + 56, h: skyH },
      });
      if (key === expanded) {
        this.detailTop = y + base;
        S.calendarWeek = key;
      }
      this.periods.push({ key, i, mo, y, h, base });
      y += h + this.GAP;
    }
    this.total = y - this.GAP;
  }
  layoutYear(): void {
    const r = atlas(),
      cols = size.W >= 1000 ? 5 : size.W >= 650 ? 3 : 2,
      rows = Math.ceil(r.months.length / cols),
      gap = size.W < 650 ? 6 : 16,
      w = (size.W - this.PAD * 2 - gap * (cols - 1)) / cols,
      total = Math.max(size.H, this.FOOT + this.PAD * 2 + gap * (rows - 1) + rows * 48),
      h = (total - this.FOOT - this.PAD * 2 - gap * (rows - 1)) / rows,
      head = size.W >= 1100 ? 46 : 38;
    this.yr = {
      cols,
      head,
      cw: w / 7,
      ch: Math.max(0, Math.min(26, (h - head - 24) / 6)),
      compact: size.W < 650 || h < 200,
    };
    for (const [k, mo] of r.months.entries()) {
      this.blocks.push({
        t: 'mini',
        mo,
        x: this.PAD + (k % cols) * (w + gap),
        y: this.PAD + Math.floor(k / cols) * (h + gap),
        w,
        h,
      });
    }
    this.total = total;
  }
  weekFor(i: number, key: string | null = S.calendarWeek): WeekBlock | undefined {
    const weeks = this.blocks.filter((b): b is WeekBlock => b.t === 'week');
    return (
      weeks.find((b) => b.key === key && b.wk.includes(i)) ??
      weeks.find((b) => b.mo.idx.includes(i) && b.wk.includes(i)) ??
      weeks.find((b) => b.wk.includes(i))
    );
  }
  topNight(): number {
    return S.calZoom === 'year' ? this.month().idx[0] : (this.active()?.i ?? 0);
  }
  contains(i: number): boolean {
    const p = this.active();
    if (!p) return this.month().idx.includes(i);
    return S.calZoom === 'month'
      ? this.blocks.some((b) => b.t === 'week' && b.mo === p.mo && b.wk.includes(i))
      : this.blocks.some((b) => b.t === 'week' && b.key === p.key && b.wk.includes(i));
  }
  anchor(): CalendarAnchor {
    if (S.calZoom === 'year') {
      const b = this.blocks.find((b) => b.t === 'mini' && b.y + b.h > scroller.scrollTop + 1);
      return {
        key: b?.mo.key ?? this.month().key,
        offset: b ? (scroller.scrollTop - b.y) / b.h : 0,
      };
    }
    const p = this.active();
    return { key: p?.key ?? this.month().key, offset: p ? (scroller.scrollTop - p.y) / p.h : 0 };
  }
  restoreAnchor(a: CalendarAnchor): void {
    const p =
      S.calZoom === 'year'
        ? this.blocks.find((b) => b.mo.key === a.key)
        : this.periods.find((p) => p.key === a.key);
    scroller.scrollTop = p ? p.y + p.h * a.offset : 0;
  }
  scrollTo(i: number, top: boolean): void {
    const n = atlas().nights[i];
    if (!n) return;
    S.calendarMonth = `${n.y}-${pad2(n.m)}`;
    if (S.calZoom === 'year') {
      const b = this.blocks.find((b) => b.mo.key === S.calendarMonth);
      if (b && b.y < scroller.scrollTop) scroller.scrollTop = b.y - this.PAD;
      else if (b && b.y + b.h > scroller.scrollTop + size.H)
        scroller.scrollTop = b.y + b.h - size.H + this.PAD;
      return;
    }
    const row = this.weekFor(i);
    // A direct placeholder click owns its displayed row; keyboard/view entry uses a canonical key.
    if (S.calZoom === 'month' && row) S.calendarMonth = row.mo.key;
    const p =
      S.calZoom === 'month'
        ? this.periods.find((p) => p.key === S.calendarMonth)
        : this.periods.find((p) => p.key === `week:${i - n.dow}`);
    if (!p) return;
    if (top) scroller.scrollTop = p.y;
    const y = row?.y ?? p.y,
      bottom = y + (row?.base ?? p.base);
    if (S.calZoom === 'month') {
      if (y < scroller.scrollTop) scroller.scrollTop = y - 12;
      else if (bottom > scroller.scrollTop + size.H) scroller.scrollTop = bottom - size.H;
    } else if (!top && (y < scroller.scrollTop || bottom > scroller.scrollTop + size.H))
      scroller.scrollTop = y - 12;
    if (this.detailTop != null && S.sel === i) this.reveal();
  }
  reveal(): void {
    if (this.detailTop == null) return;
    const row = this.weekFor(S.sel),
      desired = this.detailTop + NIGHT_DETAIL_HEIGHT - size.H;
    const cap = row && row.base + NIGHT_DETAIL_HEIGHT <= size.H ? row.y : Infinity;
    scroller.scrollTop = Math.max(0, Math.min(cap, Math.max(scroller.scrollTop, desired)));
  }
  draw(st: number): void {
    this.annotations = [];
    if (S.calZoom === 'year') this.drawYear(st);
    else {
      const p = this.active();
      if (p) {
        S.calendarMonth = p.mo.key;
        const b = this.blocks.find((b) => b.t === 'week' && b.key === p.key);
        if (b?.t === 'week' && b.axis && b.body) {
          this.weekAxis = b.axis;
          this.weekBody = b.body;
        }
      }
      for (const p of this.periods) {
        if (p.y + p.h < st || p.y > st + size.H) continue;
        if (S.calZoom === 'month') this.drawMonth(p, st);
        else {
          const b = this.blocks.find((b): b is WeekBlock => b.t === 'week' && b.key === p.key);
          if (b) this.drawWeek(b, st);
        }
        const y = p.y + (S.calZoom === 'month' ? p.h : p.base) - this.FOOT - st;
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, y, size.W, this.FOOT);
        text(
          S.calZoom === 'month'
            ? `Green bars: usable dark · 0–${this.scale()}h · ● New moon`
            : 'Select a night for the shared timeline',
          this.PAD,
          y + 12,
          11,
          C.ink2,
        );
      }
      if (this.detailTop != null) {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, this.detailTop - st, size.W, NIGHT_DETAIL_HEIGHT);
        drawNightDetail(atlas().nights[S.sel], this.detailTop - st);
        placeNightDetail('calendarDetail', this.detailTop, st, 0, size.W, 0);
      }
    }
  }
  bar(n: Night, x: number, y: number, w: number, h: number): void {
    if (n.mfMs <= 0) return;
    drawDurationBar(n.mfMs, this.scale() * MS_H, x, y, w, h, 'h', this.durationOpacity(n));
  }
  durationOpacity(n: Night): number {
    return S.focus > 0 && Math.abs(n.nmOff) > S.focus ? 0.45 : 1;
  }
  drawMonth(p: Period, st: number): void {
    const r = atlas(),
      { cw } = this.cols();
    WD3.forEach((day, d) =>
      text(day, (d + 0.5) * cw, p.y + this.TOP + 11 - st, 11, C.ink2, 'center'),
    );
    for (const b of this.blocks) {
      if (b.t !== 'week' || b.mo !== p.mo || b.y + b.h < st || b.y > st + size.H) continue;
      for (let d = 0; d < 7; d++) {
        const i = b.wk[d],
          n = r.nights[i],
          date = this.dateAt(b.start + d),
          x = d * cw,
          y = b.y - st,
          adjacent = date.m !== b.mo.m || date.y !== b.mo.y,
          isNew = n && !adjacent && this.newMoons.has(n.id);
        ctx.fillStyle = adjacent ? C.panel : C.raised;
        ctx.fillRect(x, y, cw, b.base);
        ctx.strokeStyle = C.hair2;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cw, b.base);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cw, b.base);
        ctx.clip();
        if (isNew) {
          ctx.beginPath();
          ctx.arc(x + 14, y + 13, 9, 0, Math.PI * 2);
          ctx.fillStyle = C.ink;
          ctx.fill();
        }
        text(
          String(date.d),
          x + (isNew ? 14 : 7),
          y + 13,
          12,
          isNew ? inkOn(C.ink) : i >= 0 && i === r.tonightIdx ? C.now : adjacent ? C.ink3 : C.ink,
          isNew ? 'center' : 'left',
          600,
        );
        if (n && !adjacent) this.drawSummary(n, x, y, cw, b.base);
        else if (!n) text('—', x + 7, y + 38, 12, C.ink3);
        ctx.restore();
        this.outline(i, b, x, y, cw, b.base);
      }
    }
  }
  drawSummary(n: Night, x: number, y: number, w: number, h: number): void {
    const narrow = w < 150,
      dim = S.focus > 0 && Math.abs(n.nmOff) > S.focus,
      ink = dim || !n.mfMs ? C.ink3 : C.ink,
      hours = !n.mfMs ? '0h' : narrow ? `${fmtHrs(n.mfMs)}h` : fmtDur(n.mfMs),
      hp = narrow ? Math.min(15, ((w - 16) / tw(hours, 15, 600)) * 15) : 21,
      wp = narrow ? 12 : 18;
    if (!this.newMoons.has(n.id)) moonGlyph(n, x + w - 15, y + 13, 5);
    if (w >= 105) text(`${Math.round(n.illum * 100)}%`, x + w - 26, y + 13, 11, C.ink3, 'right');
    text(hours, x + 7, y + (narrow ? 32 : 39), hp, ink, 'left', 600);
    let line =
      n.mfH.length === 1
        ? `${fmtClockS(n.mfH[0][0])}–${fmtClockS(n.mfH[0][1])}`
        : n.mfH.length
          ? `${n.mfH.length} windows`
          : '—';
    if (tw(line, wp, 500) <= w - 20)
      text(line, x + 7, y + (narrow ? 52 : Math.min(65, h - 18)), wp, ink, 'left', 500);
    else if (n.mfH.length === 1) {
      for (const [j, t] of n.mfH[0].entries()) {
        const label = fmtClockS(t);
        text(
          label,
          x + 5,
          y + 49 + j * 14,
          Math.min(wp, ((w - 16) / tw(label, wp, 500)) * wp),
          ink,
          'left',
          500,
        );
      }
    } else {
      line = n.mfH.length ? 'Split' : '—';
      text(line, x + 7, y + 53, wp, ink);
    }
    if (n.mfMs > 0) {
      // A shared height across months makes duration differences comparable across each week.
      const maxHeight = Math.min(96, Math.max(78, (size.H - this.TOP - 22 - this.FOOT) / 6) - 20);
      drawDurationBar(
        n.mfMs,
        this.scale() * MS_H,
        x + w - 7,
        y + h - 8 - maxHeight,
        3,
        maxHeight,
        'v',
        this.durationOpacity(n),
      );
    }
  }
  outline(i: number, b: WeekBlock, x: number, y: number, w: number, h: number): void {
    if (i < 0) return;
    if (
      (i === S.sel && (!S.calendarWeek || b.key === S.calendarWeek)) ||
      (S.hover?.i === i && S.hover.week === b.key)
    ) {
      ctx.strokeStyle = i === S.sel ? C.select : C.ink3;
      ctx.lineWidth = i === S.sel ? 2 : 1;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }
  drawWeek(b: WeekBlock, st: number): void {
    const r = atlas(),
      { x0, cw } = this.cols(),
      axis = b.axis!,
      body = b.body!,
      y = body.y - st,
      h = body.h,
      span = axis.end - axis.start;
    for (let d = 0; d < 7; d++) {
      const i = b.wk[d],
        n = r.nights[i],
        date = this.dateAt(b.start + d),
        x = x0 + d * cw;
      text(WD3[d], x + cw / 2, b.y + 9 - st, 11, C.ink2, 'center');
      text(
        date.d === 1 ? `${MON3[date.m - 1]} 1` : String(date.d),
        x + cw / 2,
        b.y + 25 - st,
        12,
        i >= 0 && i === r.tonightIdx ? C.now : C.ink,
        'center',
        600,
      );
      if (n) {
        const full = n.mfMs ? fmtDur(n.mfMs) : '0h';
        text(
          tw(full, 12, 600) <= cw - 6 ? full : `${fmtHrs(n.mfMs)}h`,
          x + cw / 2,
          b.y + 44 - st,
          12,
          n.mfMs ? C.ink : C.ink3,
          'center',
          600,
        );
        drawNight(n, x + 1, y, cw - 2, h, 'v', {
          axis,
          dim: S.focus > 0 && Math.abs(n.nmOff) > S.focus,
        });
        // Keep the clock guide beneath opaque time labels, including a Moon edge near midnight.
        if (axis.start < 24 && axis.end > 24) {
          const alpha = ctx.globalAlpha;
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = C.ink3;
          ctx.fillRect(x + 1, y + ((24 - axis.start) / span) * h, cw - 2, 1);
          ctx.globalAlpha = alpha;
        }
        const labels = calendarEventLabels(n, axis, h).map((e) => {
          const preferred = cw < 65 ? 12 : 13,
            font = Math.min(preferred, ((cw - 6) / tw(e.time, preferred, 500)) * preferred);
          return {
            ...e,
            font,
            lw: tw(e.time, font, 500) + 4,
            ly: y + e.y,
            leader: Math.abs(e.y - e.anchor) > 0.75,
          };
        });
        // Draw all leaders before opaque backings, so a later connector cannot cross earlier text.
        ctx.strokeStyle = C.ink3;
        ctx.lineWidth = 1;
        for (const e of labels) {
          if (!e.leader) continue;
          ctx.beginPath();
          ctx.moveTo(x + 3, y + e.anchor);
          ctx.lineTo(x + 6, y + e.anchor);
          ctx.lineTo(x + 6, e.ly);
          ctx.lineTo(x + (cw - e.lw) / 2, e.ly);
          ctx.stroke();
        }
        for (const e of labels) {
          ctx.fillStyle = C.panel;
          ctx.fillRect(x + (cw - e.lw) / 2, e.ly - 8, e.lw, 16);
          text(e.time, x + cw / 2, e.ly, e.font, inkOn(C.panel), 'center', 500);
          this.annotations.push({
            i,
            name: e.name,
            time: e.time,
            y: body.y + e.y,
            anchor: body.y + e.anchor,
            x: x + (cw - e.lw) / 2,
            w: e.lw,
            leader: e.leader,
          });
        }
      }
      ctx.fillStyle = C.hair2;
      ctx.fillRect(x, y, 1, h);
      this.outline(i, b, x, b.y - st, cw, b.base);
    }
    for (const tick of hourTicks(h / span, axis)) {
      if (!tick.major && !tick.midnight) continue;
      const ty = y + ((tick.hh - axis.start) / span) * h;
      if (ty < y + 12 || ty > y + h - 12) continue;
      text(tick.label, x0 - 6, ty, 11, C.ink2, 'right');
    }
  }
  drawYear(st: number): void {
    ctx.save();
    ctx.translate(0, -st);
    const r = atlas(),
      { cw, ch, head } = this.yr;
    for (const b of this.blocks) {
      if (b.t !== 'mini' || b.y + b.h < st || b.y > st + size.H) continue;
      ctx.fillStyle = C.raised;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (b.mo.idx.includes(S.sel)) {
        ctx.strokeStyle = C.select;
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      }
      if (this.yr.compact) {
        if (b.h >= 74)
          b.mo.idx.forEach((i, d) => {
            const n = r.nights[i],
              bw = (b.w - 16) / b.mo.idx.length;
            drawDurationBar(
              n.mfMs,
              this.scale() * MS_H,
              b.x + 8 + d * bw,
              b.y + b.h - 21,
              Math.max(1, bw - 1),
              14,
              'v',
              this.durationOpacity(n),
            );
          });
        continue;
      }
      WD1.forEach((day, d) =>
        text(day, b.x + (d + 0.5) * cw, b.y + head + 8, 11, C.ink2, 'center'),
      );
      b.mo.weeks.forEach((wk, wi) =>
        wk.forEach((i, d) => {
          if (i < 0) return;
          const n = r.nights[i],
            left = b.x + d * cw,
            top = b.y + head + 20 + wi * ch,
            x = left + cw / 2,
            y = top + 9,
            isNew = this.newMoons.has(n.id);
          if (isNew) {
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
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
          this.bar(n, left + 5, top + ch - 3, cw - 10, 2);
        }),
      );
    }
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, this.total - this.FOOT, size.W, this.FOOT);
    const bars = !this.yr.compact || this.blocks.some((b) => b.t === 'mini' && b.h >= 74);
    text(
      bars
        ? `Green: usable hours · 0–${this.scale()}h · ${this.yr.compact ? 'New moon dates' : '● New moon'}`
        : 'New moon dates · select a month',
      this.PAD,
      this.total - 12,
      11,
      C.ink2,
    );
    ctx.restore();
  }
  hit(px: number, py: number): Hit | null {
    const cy = py + scroller.scrollTop;
    if (S.calZoom === 'year') {
      const b = this.blocks.find(
        (b) => b.t === 'mini' && px >= b.x && px < b.x + b.w && cy >= b.y && cy < b.y + b.h,
      );
      return b ? { month: b.mo.key } : null;
    }
    const { x0, cw } = this.cols(),
      d = Math.floor((px - x0) / cw),
      b = this.blocks.find(
        (b): b is WeekBlock =>
          b.t === 'week' && cy >= b.y && cy < b.y + b.base - (S.calZoom === 'week' ? this.FOOT : 0),
      );
    return b && d >= 0 && d < 7 && b.wk[d] >= 0 ? { i: b.wk[d], week: b.key } : null;
  }
}
export const calendar = new CalendarView();
