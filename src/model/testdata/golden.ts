/**
 * Golden records of computed nights, for characterization tests.
 *
 * The committed golden files were first captured from the original single-file prototype,
 * and have since been intentionally updated for upper-limb Moon events and refined crossings. After
 * an intentional change to the night model, regenerate them with `npx vitest run -u` and
 * review the diff.
 */
import { SUN_EVENTS, type Night, type Site } from '../night';
import {
  bestWeekends,
  computeRangeSync,
  deriveRange,
  type Axis,
  type Lunation,
  type NightRange,
} from '../range';

/** Sample positions of the stored altitude samples. */
const SAMPLE_IDX = [0, 30, 60, 90, 120];

export interface NightRecord {
  i: number;
  id: string;
  dow: number;
  noon: number;
  mid: number;
  ev: Array<number | null>;
  evH: Array<number | null>;
  illum: number;
  phase: number;
  dst: boolean;
  quarter: number;
  nmOff: number;
  moonRise: number | null;
  moonSet: number | null;
  moonUp: number[][];
  moonIgnored: boolean;
  td: number[] | null;
  mf: number[][];
  mfMs: number;
  moonAlt: number[];
  sunAlt: number[];
}

export interface LunationRecord {
  t: number;
  i: number;
  total: number;
  best: { i: number; sum: number } | null;
}

export interface Variant {
  nights: NightRecord[];
  lunations: LunationRecord[];
}

/** Everything a golden file records for one site. */
export interface GoldenCapture {
  now: number;
  site: Site;
  ax: Axis;
  tonight: number;
  variants: { default: Variant; moonAlt10: Variant; crescent20: Variant };
  focus5Lunations: LunationRecord[];
}

export function nightRecord(n: Night, i: number): NightRecord {
  return {
    i,
    id: n.id,
    dow: n.dow,
    noon: n.noon,
    mid: n.mid,
    ev: SUN_EVENTS.map((k) => n.ev[k]),
    evH: SUN_EVENTS.map((k) => n.evH[k]),
    illum: n.illum,
    phase: n.phase,
    dst: n.dst,
    quarter: n.quarter,
    nmOff: n.nmOff,
    moonRise: n.moonRise,
    moonSet: n.moonSet,
    moonUp: n.moonUp,
    moonIgnored: n.moonIgnored,
    td: n.td,
    mf: n.mf,
    mfMs: n.mfMs,
    moonAlt: SAMPLE_IDX.map((k) => n.moonAlt[k]),
    sunAlt: SAMPLE_IDX.map((k) => n.sunAlt[k]),
  };
}

const lunationRecord = (L: Lunation): LunationRecord => ({
  t: L.t,
  i: L.i,
  total: L.total,
  best: L.best,
});

const variant = (r: NightRange): Variant => ({
  nights: r.nights.map(nightRecord),
  lunations: r.lunations.map(lunationRecord),
});

/** Compute a site's default range and capture it the way the prototype capture did. */
export function captureGolden(site: Site, now: number): GoldenCapture {
  const r = computeRangeSync(site, 0, { moonAlt: 0, crescent: 0 }, 14, now);
  const def = variant(r);
  deriveRange(r, { moonAlt: 10, crescent: 0 }, 14);
  const moonAlt10 = variant(r);
  deriveRange(r, { moonAlt: 0, crescent: 0.2 }, 14);
  const crescent20 = variant(r);
  deriveRange(r, { moonAlt: 0, crescent: 0 }, 14);
  bestWeekends(r, 5);
  return {
    now,
    site,
    ax: r.ax,
    tonight: r.tonightIdx,
    variants: { default: def, moonAlt10, crescent20 },
    focus5Lunations: r.lunations.map(lunationRecord),
  };
}

// ---------- serialization: stable, rounded, one record per line

const ms = (v: number | null) => (v == null ? null : Math.round(v));
const fine = (v: number | null) => (v == null ? null : Math.round(v * 1e9) / 1e9);
const iv = (list: number[][]) => list.map(([a, b]) => [Math.round(a), Math.round(b)]);

function nightLine(n: NightRecord): string {
  return JSON.stringify({
    i: n.i,
    id: n.id,
    dow: n.dow,
    noon: ms(n.noon),
    mid: ms(n.mid),
    ev: n.ev.map(ms),
    evH: n.evH.map(fine),
    illum: fine(n.illum),
    phase: fine(n.phase),
    dst: n.dst,
    quarter: n.quarter,
    nmOff: n.nmOff,
    moonRise: ms(n.moonRise),
    moonSet: ms(n.moonSet),
    td: n.td && iv([n.td])[0],
    moonUp: iv(n.moonUp),
    moonIgnored: n.moonIgnored,
    mf: iv(n.mf),
    mfMs: ms(n.mfMs),
    moonAlt: n.moonAlt.map((v) => Math.round(v * 1e5) / 1e5),
    sunAlt: n.sunAlt.map((v) => Math.round(v * 1e5) / 1e5),
  });
}

/** Only the fields a threshold changes. */
function derivedLine(n: NightRecord): string {
  return JSON.stringify({
    i: n.i,
    id: n.id,
    moonUp: iv(n.moonUp),
    moonIgnored: n.moonIgnored,
    mf: iv(n.mf),
    mfMs: ms(n.mfMs),
  });
}

function lunationLine(L: LunationRecord): string {
  return JSON.stringify({
    t: L.t,
    i: L.i,
    total: ms(L.total),
    best: L.best && { i: L.best.i, sum: ms(L.best.sum) },
  });
}

const list = (lines: string[]) => `[\n    ${lines.join(',\n    ')}\n  ]`;

/** Serialize a capture: every `every`-th night, plus every night with a clock change. */
export function serializeGolden(c: GoldenCapture, every: number): string {
  const keep = (n: NightRecord) => n.i % every === 0 || n.dst;
  const pick = (v: Variant) => v.nights.filter(keep);
  return `{
  "site": ${JSON.stringify(c.site)},
  "now": ${c.now},
  "ax": ${JSON.stringify(c.ax)},
  "tonight": ${c.tonight},
  "nights": ${list(pick(c.variants.default).map(nightLine))},
  "moonAlt10": ${list(pick(c.variants.moonAlt10).map(derivedLine))},
  "crescent20": ${list(pick(c.variants.crescent20).map(derivedLine))},
  "lunations": ${list(c.variants.default.lunations.map(lunationLine))},
  "focus5Lunations": ${list(c.focus5Lunations.map(lunationLine))}
}
`;
}
