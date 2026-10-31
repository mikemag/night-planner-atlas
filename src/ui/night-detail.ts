import { S, atlas } from '../app/state';
import { phaseName } from '../model/describe';
import { fmtClock, fmtDur, nightTitle, SUN_NAMES } from '../model/format';
import { SUN_EVENTS, wallH, type Night } from '../model/night';
import { layoutBoundaryLabels } from '../render/boundary-labels';
import { ctx, size, text, tw } from '../render/surface';
import { C } from '../render/colors';
import { drawNight, hourTicks, moonGlyph } from '../render/night-draw';
import { el } from './dom';

const NS = 'http://www.w3.org/2000/svg';

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export interface DetailGeometry {
  width: number;
  x0: number;
  cw: number;
  start: number;
  end: number;
  moonX: number;
}

/** Ordered event callouts shared by all three views. */
export function annotationChart(n: Night, g: DetailGeometry): SVGSVGElement {
  const X = (hh: number) => g.x0 + ((hh - g.start) / (g.end - g.start)) * g.cw;
  const events: Array<{
    instant: number;
    hh: number;
    name: string;
    accepted: boolean;
    lane: number;
  }> = [];
  const add = (instant: number | null, name: string, lane: number, accepted = false) => {
    if (instant == null) return;
    const hh = wallH(instant, n);
    if (hh < g.start || hh > g.end) return;
    const existing = events.find(
      (event) => event.lane === lane && Math.abs(event.instant - instant) < 1000,
    );
    if (existing) {
      existing.accepted ||= accepted;
      if (!accepted && !existing.name.includes(name)) existing.name += ` / ${name}`;
      return;
    }
    events.push({ instant, hh, name, accepted, lane });
  };
  SUN_EVENTS.forEach((key, i) => add(n.ev[key], SUN_NAMES[i], i < 4 ? i : 7 - i));
  for (const crossing of n.moonWindows[0].crossings)
    add(crossing.t, crossing.rising ? 'Moonrise' : 'Moonset', 4);
  for (const [start, end] of n.mf) {
    if (!events.some((event) => Math.abs(event.instant - start) < 1000))
      add(start, 'Usable starts', 4, true);
    if (!events.some((event) => Math.abs(event.instant - end) < 1000))
      add(end, 'Usable ends', 4, true);
  }
  const labels = layoutBoundaryLabels(
    events.map((e) => ({
      x: X(e.hh),
      lane: e.lane,
      width: Math.max(tw(fmtClock(e.hh), 12, 650), tw(e.name, 10, 500)) + 12,
    })),
    g.width,
    { 0: g.x0 + 8 },
  );
  const bracketY = 4;
  const windows = n.mf.map(([start, end], i) => ({
    start: X(n.mfH[i][0]),
    end: X(n.mfH[i][1]),
    duration: fmtDur(end - start),
  }));
  const durations = layoutBoundaryLabels(
    windows.map((w) => ({
      x: (w.start + w.end) / 2,
      lane: 0,
      width: Math.max(66, tw(w.duration, 15, 700) + 12),
    })),
    g.width,
  );
  // Four solar levels and one shared Moon level stay reserved even when events are absent.
  const height = 178;
  const svg = svgElement('svg', {
    class: 'river-annotations',
    width: g.width,
    height,
    viewBox: `0 0 ${g.width} ${height}`,
    role: 'img',
    'aria-label':
      events.map((e) => `${e.name} ${fmtClock(e.hh)}`).join('; ') +
      `; ${fmtDur(n.mfMs)} usable dark; Moon ${Math.round(n.illum * 100)}% lit, ${phaseName(n)}`,
  });
  // All leaders are behind opaque label backings, so dense clusters cannot cross the text.
  for (const label of labels) {
    const event = events[label.index];
    const y = 32 + label.lane * 26;
    const path = svgElement('path', {
      d: `M ${label.x} 0 V 5 L ${label.labelX} ${y - 4} V ${y}`,
      class: event.accepted ? 'river-leader accepted' : 'river-leader',
    });
    svg.append(
      path,
      svgElement('circle', {
        cx: label.x,
        cy: 1.5,
        r: 2,
        class: event.accepted ? 'river-boundary accepted' : 'river-boundary',
      }),
    );
  }
  for (const label of labels) {
    const event = events[label.index];
    const y = 32 + label.lane * 26;
    const group = svgElement('g', {
      class: 'river-event',
      'data-boundary-x': label.x,
      'data-event': event.name,
      'data-time': fmtClock(event.hh),
    });
    group.appendChild(
      svgElement('rect', {
        x: label.labelX - label.width / 2,
        y: y - 1,
        width: label.width,
        height: 23,
        class: 'river-label-backing',
      }),
    );
    const time = svgElement('text', {
      x: label.labelX,
      y: y + 10,
      class: event.accepted ? 'river-event-time accepted' : 'river-event-time',
    });
    time.textContent = fmtClock(event.hh);
    const name = svgElement('text', { x: label.labelX, y: y + 21, class: 'river-event-name' });
    name.textContent = event.name;
    group.append(time, name);
    svg.appendChild(group);
  }
  for (const label of durations) {
    const window = windows[label.index];
    const y = bracketY;
    const group = svgElement('g', {
      class: 'river-window',
      'data-start-x': window.start,
      'data-end-x': window.end,
    });
    group.appendChild(
      svgElement('path', {
        d: `M ${window.start} ${y - 4} V ${y} H ${window.end} V ${y - 4}`,
        class: 'river-window-bracket',
      }),
    );
    group.appendChild(
      svgElement('rect', {
        x: label.labelX - label.width / 2,
        y: 12,
        width: label.width,
        height: 19,
        class: 'river-label-backing',
      }),
    );
    const value = svgElement('text', {
      x: label.labelX,
      y: 27,
      class: 'river-window-duration',
    });
    value.textContent = window.duration;
    const title = svgElement('title', {});
    title.textContent = `${window.duration} usable dark`;
    group.append(title, value);
    svg.appendChild(group);
  }
  if (!durations.length) {
    const text = svgElement('text', { x: g.width / 2, y: 25, class: 'river-no-window' });
    text.textContent = n.td ? 'Moon up through all true dark' : 'No astronomical darkness';
    const textWidth = tw(text.textContent, 12, 500) + 12;
    svg.appendChild(
      svgElement('rect', {
        x: (g.width - textWidth) / 2,
        y: 11,
        width: textWidth,
        height: 20,
        class: 'river-label-backing',
      }),
    );
    svg.appendChild(text);
  }
  const percent = svgElement('text', { x: g.moonX, y: 12, class: 'river-moon-percent' });
  percent.textContent = `${Math.round(n.illum * 100)}%`;
  const moonTitle = svgElement('title', {});
  moonTitle.textContent = `${Math.round(n.illum * 100)}% lit · ${phaseName(n)}`;
  percent.appendChild(moonTitle);
  svg.appendChild(percent);
  const words = phaseName(n).split(' ');
  const phaseWidth = Math.max(...words.map((word) => tw(word, 9, 500))) + 8;
  svg.appendChild(
    svgElement('rect', {
      x: g.moonX - phaseWidth / 2,
      y: 16,
      width: phaseWidth,
      height: 24,
      class: 'river-label-backing',
    }),
  );
  const phase = svgElement('text', { x: g.moonX, y: 25, class: 'river-moon-phase' });
  words.forEach((word, i) => {
    const line = svgElement('tspan', { x: g.moonX, dy: i ? 11 : 0 });
    line.textContent = (i ? ' ' : '') + word;
    phase.appendChild(line);
  });
  svg.appendChild(phase);
  const notes = [
    n.dst ? 'Clocks change · elapsed durations' : '',
    n.moonIgnored ? 'Moon ignored' : S.moonAlt > 0 ? `Moon below ${S.moonAlt}° accepted` : '',
  ].filter(Boolean);
  const note = svgElement('text', { x: g.width / 2, y: 173, class: 'river-detail-note' });
  note.textContent = notes.join(' · ');
  svg.appendChild(note);
  return svg;
}

export const NIGHT_DETAIL_HEADING = 44;
export const NIGHT_DETAIL_AXIS = 22;
export const NIGHT_DETAIL_BAND = 24;
export const NIGHT_DETAIL_HEIGHT =
  NIGHT_DETAIL_HEADING + NIGHT_DETAIL_AXIS + NIGHT_DETAIL_BAND + 179;

const panels = new WeakMap<HTMLElement, { key: string; night: Night; windows: Night['mf'] }>();

export function nightDetailGeometry(): DetailGeometry {
  const x0 = 64;
  return {
    width: size.W,
    x0,
    cw: Math.max(40, size.W - x0 - 12),
    start: atlas().ax.start,
    end: atlas().ax.end,
    moonX: 32,
  };
}

/** Calendar and Lunations use the same full-width panel around River's event renderer. */
export function prepareNightDetail(
  id: string,
  n: Night | null,
  g: DetailGeometry,
  outside = false,
): void {
  const box = el(id);
  box.hidden = !n;
  if (!n) return;
  const key = JSON.stringify([g, outside, S.site.tz]);
  const previous = panels.get(box);
  if (previous?.key === key && previous.night === n && previous.windows === n.mf) return;
  panels.set(box, { key, night: n, windows: n.mf });
  const heading = document.createElement('header');
  heading.className = 'night-detail-heading';
  const title = document.createElement('h3');
  title.textContent = nightTitle(n);
  const zone = document.createElement('p');
  zone.textContent = `${S.site.tz}${outside ? ' · Night outside displayed window' : ''}`;
  const name = document.createElement('div');
  name.append(title, zone);
  const close = document.createElement('button');
  close.className = 'icon-btn';
  close.id = id === 'lunationsDetail' ? 'lunationsCollapse' : 'calendarCollapse';
  close.setAttribute('aria-label', 'Collapse night');
  close.textContent = '×';
  heading.append(name, close);
  const slot = document.createElement('div');
  slot.className = 'night-detail-slot';
  slot.setAttribute('aria-hidden', 'true');
  box.replaceChildren(heading, slot, annotationChart(n, g));
}

export function placeNightDetail(
  id: string,
  top: number,
  scrollTop: number,
  left: number,
  width: number,
  axis: number,
): void {
  const box = el(id);
  box.style.top = `${top}px`;
  box.style.left = `${left}px`;
  box.style.width = `${width}px`;
  box.style.clipPath = `inset(${Math.max(0, scrollTop + axis - top)}px 0 0 0)`;
}

/** The panel's transparent slot reveals this canvas strip, on the same range-wide clock. */
export function drawNightDetail(n: Night, y: number): void {
  const g = nightDetailGeometry();
  const axis = y + NIGHT_DETAIL_HEADING;
  const sky = axis + NIGHT_DETAIL_AXIS;
  for (const tick of hourTicks(g.cw / (g.end - g.start))) {
    if (tick.major)
      text(
        tick.label,
        g.x0 + ((tick.hh - g.start) / (g.end - g.start)) * g.cw,
        axis + 11,
        10.5,
        C.ink3,
        'center',
        tick.midnight ? 700 : 450,
      );
  }
  drawNight(n, g.x0, sky, g.cw, NIGHT_DETAIL_BAND, 'h');
  moonGlyph(n, g.moonX, sky + NIGHT_DETAIL_BAND / 2, 7);
  ctx.fillStyle = C.select;
  ctx.fillRect(1, y, 2, NIGHT_DETAIL_HEIGHT);
  ctx.fillRect(size.W - 3, y, 2, NIGHT_DETAIL_HEIGHT);
}
