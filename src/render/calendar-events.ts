import { SUN_EVENTS, solarCrossings, wallH, type Night } from '../model/night';
import type { Axis } from '../model/range';
import { fmtClockS, SUN_NAMES } from '../model/format';
import { layoutBoundaryLabels } from './boundary-labels';
import { moonlightBands } from './moonlight';

/** Label the actual painted edges, omitting Moon events that cause no visible shading change. */
export function calendarEvents(n: Night) {
  const events = solarCrossings(n).map(({ event, t }) => ({
    t,
    hh: wallH(t, n),
    name: SUN_NAMES[SUN_EVENTS.indexOf(event)],
  }));
  const bands = moonlightBands(n);
  for (const t of [...bands.ordinary, ...bands.accepted].flat()) {
    if (!events.some((e) => Math.abs(e.t - t) < 1000))
      events.push({ t, hh: wallH(t, n), name: 'Moonlight boundary' });
  }
  return events.sort((a, b) => a.t - b.t);
}

/** Reuse the shared collision solver vertically, preserving the exact boundary with a leader. */
export function calendarEventLabels(n: Night, axis: Axis, height: number) {
  const events = calendarEvents(n).filter((e) => e.hh >= axis.start && e.hh <= axis.end);
  return layoutBoundaryLabels(
    events.map((e) => ({
      x: ((e.hh - axis.start) / (axis.end - axis.start)) * height,
      width: 16,
      lane: 0,
    })),
    height,
  ).map((label) => ({
    ...events[label.index],
    anchor: label.x,
    y: label.labelX,
    time: fmtClockS(events[label.index].hh),
  }));
}
