import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { chooseTheme } from './header-controls';

for (const width of [1512, 390]) {
  test(`phase/altitude wash preserves coverage in every view and theme at ${width}px @retina`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const height = width === 390 ? 844 : 920;
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      type Stop = { offset: number; color: string };
      const fills: Array<{ x: number; y: number; w: number; h: number; stops: Stop[] }> = [];
      const gradients = new WeakMap<CanvasGradient, Stop[]>();
      Object.assign(window, { moonlightFills: fills });
      const create = CanvasRenderingContext2D.prototype.createLinearGradient;
      CanvasRenderingContext2D.prototype.createLinearGradient = function (...args) {
        const gradient = create.apply(this, args);
        gradients.set(gradient, []);
        return gradient;
      };
      const add = CanvasGradient.prototype.addColorStop;
      CanvasGradient.prototype.addColorStop = function (offset, color) {
        gradients.get(this)?.push({ offset, color });
        add.call(this, offset, color);
      };
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
        if (this.canvas.id === 'cv') {
          if (x === 0 && y === 0 && h > 100) fills.length = 0;
          if (this.fillStyle instanceof CanvasGradient) {
            const stops = gradients.get(this.fillStyle);
            if (stops) fills.push({ x, y, w, h, stops });
          }
        }
        fill.call(this, x, y, w, h);
      };
    });
    await page.clock.setFixedTime(new Date('2026-09-24T03:00:00Z'));
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await page.waitForFunction(() => (window.__npa?.nights.length ?? 0) > 0);
    if (width <= 700) await page.locator('#moonSettingsSummary').click();
    const painted = () =>
      page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    const fills = (accepted: boolean) =>
      page.evaluate((accepted) => {
        const rgb = getComputedStyle(document.documentElement)
          .getPropertyValue(accepted ? '--moon-accepted-rgb' : '--moon-rgb')
          .match(/\d+/g)!
          .join(',');
        const items = (
          window as unknown as {
            moonlightFills: Array<{
              x: number;
              y: number;
              w: number;
              h: number;
              stops: Array<{ offset: number; color: string }>;
            }>;
          }
        ).moonlightFills;
        return items.filter(
          (f) =>
            f.stops[0]?.color
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .join(',') === rgb,
        );
      }, accepted);
    // Compare the painted footprint independent of how an accepted boundary
    // splits a horizontal or vertical gradient into separate rectangles.
    const coverage = (items: Awaited<ReturnType<typeof fills>>) => {
      const pixels = new Uint8Array(width * height);
      for (const f of items) {
        const x0 = Math.max(0, Math.ceil(f.x - 0.5)),
          x1 = Math.min(width, Math.ceil(f.x + f.w - 0.5));
        const y0 = Math.max(0, Math.ceil(f.y - 0.5)),
          y1 = Math.min(height, Math.ceil(f.y + f.h - 0.5));
        if (x1 <= x0) continue;
        for (let y = y0; y < y1; y++) pixels.fill(1, y * width + x0, y * width + x1);
      }
      return createHash('sha256').update(pixels).digest('hex');
    };
    const planning = await page.evaluate(() =>
      window.__npa!.nights.map((n) => [n.id, n.ev, n.mf, n.mfMs]),
    );
    for (const view of ['river', 'calendar', 'lunations'] as const) {
      await page.evaluate((view) => {
        const a = window.__npa!;
        a.setView(view);
        if (view === 'calendar') a.setOpt('calZoom', 'week');
        a.select(
          a.nights.findIndex((n) => n.id === '2026-09-06'),
          true,
          true,
        );
      }, view);
      await page.locator('#focusSeg button[data-val="0"]').click();
      for (const theme of ['light', 'dark', 'observing']) {
        await chooseTheme(page, theme);
        await painted();
        const wash = await fills(false);
        const baseline = coverage(wash);
        expect(wash.length).toBeGreaterThan(0);
        expect(await fills(true)).toEqual([]);
        expect(
          wash.some((f) => {
            const alpha = f.stops.map((s) => Number(s.color.match(/[\d.]+/g)![3]));
            return Math.max(...alpha) - Math.min(...alpha) > 0.005;
          }),
        ).toBe(true);
        expect(
          wash.every((f) =>
            f.stops.every((s) => {
              const alpha = Number(s.color.match(/[\d.]+/g)![3]);
              return s.offset >= 0 && s.offset <= 1 && alpha >= 0.17 && alpha <= 0.57;
            }),
          ),
        ).toBe(true);
        await page.locator('#moonAltSel').selectOption('5');
        await painted();
        expect(coverage([...(await fills(false)), ...(await fills(true))])).toBe(baseline);
        expect((await fills(true)).length).toBeGreaterThan(0);
        await page.locator('#moonAltSel').selectOption('0');
        await page.locator('#crescentSel').selectOption('0.2');
        await painted();
        expect(coverage([...(await fills(false)), ...(await fills(true))])).toBe(baseline);
        expect((await fills(true)).length).toBeGreaterThan(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        if (process.env.SCREENSHOTS)
          await page.screenshot({
            path: `test-results/screenshots/${info.project.name}-moonlight-${view}-${theme}-${width}.png`,
          });
        await page.locator('#crescentSel').selectOption('0');
        await painted();
        expect(coverage(await fills(false))).toBe(baseline);
        expect(await fills(true)).toEqual([]);
        expect(
          await page.evaluate(() => window.__npa!.nights.map((n) => [n.id, n.ev, n.mf, n.mfMs])),
        ).toEqual(planning);
      }
    }
  });
}
