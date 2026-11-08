import { Observer } from 'astronomy-engine';
import { DEFAULT_SITES } from '../../app/default-sites';
import { createShareLink } from '../../app/share-state';
import { computeNight, deriveNight, wallH, type Night } from '../../model/night';
import { TimeZone } from '../../model/time';
import { fmtClock, fmtClockS, fmtDur } from '../../model/format';
import { C } from '../../render/colors';
import { moonlightBands, moonlightStops } from '../../render/moonlight';

const site = DEFAULT_SITES[0];
const settings = {
  strict: { moonAlt: 0, crescent: 0 },
  height: { moonAlt: 5, crescent: 0 },
  crescent: { moonAlt: 0, crescent: 0.2 },
};
type Choice = keyof typeof settings;
let choice: Choice = 'strict';
let nights: { simple: Night; moon: Night } | undefined;
const NS = 'http://www.w3.org/2000/svg';
function svgNode<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** Standalone SVG of the same solar intervals and disjoint moonlight bands as the charts. */
function timeline(n: Night, width: number): SVGSVGElement {
  const start = Math.floor(n.evH.sunset! - 0.5),
    end = Math.ceil(n.evH.sunrise! + 0.5);
  const x = (h: number) => 12 + ((h - start) / (end - start)) * (width - 24);
  const svg = svgNode('svg', {
    viewBox: `0 0 ${width} 116`,
    width,
    height: 116,
    role: 'img',
    'aria-label': `${fmtDur(n.mfMs)} usable dark: ${n.mfH.map(([a, b]) => `${fmtClock(a)} to ${fmtClock(b)}`).join('; ')}`,
  });
  const segment = (a: number, b: number, fill: string, opacity = 1) => {
    const lo = Math.max(start, a),
      hi = Math.min(end, b);
    if (hi <= lo) return;
    svg.append(
      svgNode('rect', { x: x(lo), y: 36, width: x(hi) - x(lo), height: 26, fill, opacity }),
    );
  };
  segment(start, end, C.day);
  for (const [band, color] of [
    ['sun', C.civil],
    ['civil', C.naut],
    ['nautical', C.astro],
    ['astronomical', C.dark],
  ] as const)
    for (const [a, b] of n.sunBelow[band]) segment(wallH(a, n), wallH(b, n), color);
  const bands = moonlightBands(n);
  const defs = svgNode('defs', {});
  svg.append(defs);
  for (const [type, rgb] of [
    ['ordinary', C.moon],
    ['accepted', C.acceptedMoon],
  ] as const)
    for (const [a, b] of bands[type]) {
      const id = `moonlight-${n.id}-${type}-${defs.childElementCount}`;
      const gradient = svgNode('linearGradient', {
        id,
        gradientUnits: 'userSpaceOnUse',
        x1: x(wallH(a, n)),
        y1: 0,
        x2: x(wallH(b, n)),
        y2: 0,
      });
      for (const { offset, opacity } of moonlightStops(n, [a, b]))
        gradient.append(
          svgNode('stop', { offset, 'stop-color': `rgb(${rgb})`, 'stop-opacity': opacity }),
        );
      defs.append(gradient);
      segment(wallH(a, n), wallH(b, n), `url(#${id})`);
      if (type === 'accepted' && C.acceptedEdge !== 'transparent')
        svg.append(
          svgNode('rect', {
            x: x(wallH(a, n)),
            y: 37,
            width: x(wallH(b, n)) - x(wallH(a, n)),
            height: 24,
            fill: 'none',
            stroke: C.acceptedEdge,
            'stroke-dasharray': '2 3',
          }),
        );
    }
  const label = (
    s: string,
    px: number,
    y: number,
    anchor = 'middle',
    color = C.ink2,
    weight = 500,
  ) => {
    const node = svgNode('text', {
      x: px,
      y,
      'text-anchor': anchor,
      fill: color,
      'font-size': 11,
      'font-weight': weight,
    });
    node.textContent = s;
    svg.append(node);
  };
  const tick = width < 450 ? 4 : 2;
  for (let h = Math.ceil(start / tick) * tick; h <= end; h += tick)
    label(fmtClockS(h), x(h), 22, x(h) < 32 ? 'start' : x(h) > width - 32 ? 'end' : 'middle');
  for (let i = 0; i < n.mfH.length; i++) {
    const [a, b] = n.mfH[i],
      lo = x(a),
      hi = x(b);
    svg.append(
      svgNode('path', {
        d: `M ${lo} 70 V 77 H ${hi} V 70`,
        fill: 'none',
        stroke: C.good,
        'stroke-width': 2,
      }),
    );
    label(fmtDur(n.mf[i][1] - n.mf[i][0]), (lo + hi) / 2, 97, 'middle', C.ink, 650);
  }
  return svg;
}

export function renderExamples(): void {
  const hosts = document.querySelectorAll<HTMLElement>('[data-night-example]');
  if (!hosts.length || !hosts[0].clientWidth) return;
  if (!nights) {
    const observer = new Observer(site.lat, site.lon, site.elevation ?? 0),
      tz = new TimeZone(site.tz);
    nights = {
      simple: computeNight(observer, tz, 2026, 9, 11),
      moon: computeNight(observer, tz, 2026, 9, 6),
    };
  }
  for (const host of hosts) {
    const key = host.dataset.nightExample as keyof typeof nights;
    const n = nights[key];
    deriveNight(n, key === 'simple' ? settings.strict : settings[choice]);
    host.replaceChildren(timeline(n, Math.max(240, Math.floor(host.clientWidth))));
    const summary = document.createElement('p');
    summary.className = 'example-summary';
    summary.textContent = `${fmtDur(n.mfMs)} usable dark · ${n.mfH.map(([a, b]) => `${fmtClock(a)}–${fmtClock(b)}`).join(' · ')}`;
    host.append(summary);
    const link = document.querySelector<HTMLAnchorElement>(`[data-example-link="${key}"]`)!;
    link.href = createShareLink(location.href, {
      v: 1,
      preview: true,
      view: 'river',
      start: '2026-09',
      night: n.id,
      expanded: true,
      riverZoom: 'month',
      calZoom: 'month',
      calOrient: 'v',
      focus: 0,
      ...(key === 'simple' ? settings.strict : settings[choice]),
      site,
    });
  }
  document.getElementById('exampleExplanation')!.textContent = {
    strict: 'The usable window ends at moonrise.',
    height: 'The 5° cutoff accepts 40 minutes of low moonlight.',
    crescent: 'The crescent setting counts all 7h 17m of astronomical darkness as usable dark.',
  }[choice];
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-example-setting]')) {
    button.setAttribute('aria-pressed', String(button.dataset.exampleSetting === choice));
    button.classList.toggle('active', button.dataset.exampleSetting === choice);
  }
}

export function initExamples(): void {
  document.getElementById('notesView')!.addEventListener('click', (event) => {
    const key = (event.target as Element).closest<HTMLElement>('[data-example-setting]')?.dataset
      .exampleSetting;
    if (key && key in settings) {
      choice = key as Choice;
      renderExamples();
    }
  });
  new ResizeObserver(renderExamples).observe(
    document.querySelector('[data-night-example="simple"]')!,
  );
}
