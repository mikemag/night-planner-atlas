import { describe, expect, it } from 'vitest';
import { fmtClock, fmtClockS, fmtDur, fmtHrs, nightTitle } from './format';
import { MS_H, MS_M } from './time';

describe('clock times (hours after local noon)', () => {
  it('format as local clock readings', () => {
    expect(fmtClock(0)).toBe('12:00 PM');
    expect(fmtClock(8.25)).toBe('8:15 PM');
    expect(fmtClock(12)).toBe('12:00 AM');
    expect(fmtClock(18.5)).toBe('6:30 AM');
    expect(fmtClock(-0.5)).toBe('11:30 AM');
    expect(fmtClock(24 + 1 / 60)).toBe('12:01 PM');
    expect(fmtClock(null)).toBe('—');
    expect(fmtClockS(8.25)).toBe('8:15p');
    expect(fmtClockS(18.5)).toBe('6:30a');
  });
});

describe('durations', () => {
  it('read as hours and minutes', () => {
    expect(fmtDur(0)).toBe('0m');
    expect(fmtDur(29_000)).toBe('0m');
    expect(fmtDur(59 * MS_M)).toBe('59m');
    expect(fmtDur(60 * MS_M)).toBe('1h');
    expect(fmtDur(7 * MS_H + 42 * MS_M)).toBe('7h 42m');
    expect(fmtDur(-5 * MS_M)).toBe('0m');
  });

  it('read as decimal hours, with a sliver shown as <0.1', () => {
    expect(fmtHrs(0)).toBe('0.0');
    expect(fmtHrs(MS_M)).toBe('<0.1');
    expect(fmtHrs(7.74 * MS_H)).toBe('7.7');
  });
});

describe('night titles', () => {
  it('span the evening and the next morning, across months and years', () => {
    expect(nightTitle({ y: 2026, m: 10, d: 9, dow: 5 })).toBe('Fri Oct 9 → Sat Oct 10');
    expect(nightTitle({ y: 2026, m: 12, d: 31, dow: 4 })).toBe('Thu Dec 31 → Fri Jan 1');
  });
});
