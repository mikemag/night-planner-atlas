import { expect, test } from '@playwright/test';

for (const width of [1512, 390]) {
  test(`accepted moonlight uses illumination-scaled green only with relaxed thresholds at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.addInitScript(() => {
      const fills: Array<{ x: number; y: number; w: number; h: number; style: string }> = [];
      Object.assign(window, { moonlightFills: fills });
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
        if (this.canvas.id === 'cv') {
          if (x === 0 && y === 0 && h > 100) fills.length = 0;
          fills.push({ x, y, w, h, style: String(this.fillStyle) });
        }
        fill.call(this, x, y, w, h);
      };
    });
    await page.clock.setFixedTime(new Date('2026-09-24T03:00:00Z'));
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await page.waitForFunction(() => (window.__npa?.nights.length ?? 0) > 0);
    await page.evaluate(() => {
      const app = window.__npa!;
      app.select(
        app.nights.findIndex((n) => n.id === '2026-10-06'),
        true,
        true,
      );
    });
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
            moonlightFills: Array<{ style: string; y: number; w: number; h: number }>;
          }
        ).moonlightFills;
        return items.filter(
          (f) =>
            f.style.startsWith('rgba(') &&
            f.style
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .join(',') === rgb,
        );
      }, accepted);
    const coverage = (items: Awaited<ReturnType<typeof fills>>) => {
      const rows = new Map<number, { area: number; alpha: string }>();
      for (const f of items) {
        const alpha = f.style.match(/[\d.]+/g)![3];
        const row = rows.get(f.y) ?? { area: 0, alpha };
        expect(alpha).toBe(row.alpha);
        row.area += f.w * f.h;
        rows.set(f.y, row);
      }
      return [...rows.entries()]
        .map(([y, row]) => [y, { ...row, area: Math.round(row.area * 1e6) / 1e6 }] as const)
        .sort(([a], [b]) => a - b);
    };
    await painted();
    const wash = await fills(false);
    const baseline = coverage(wash);
    expect(wash.length).toBeGreaterThan(0);
    expect(await fills(true)).toEqual([]);

    await page.locator('#moonAltSel').selectOption('15');
    await painted();
    expect(coverage([...(await fills(false)), ...(await fills(true))])).toEqual(baseline);
    expect((await fills(true)).length).toBeGreaterThan(0);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-moonlight-altitude-${width}.png`,
      });

    await page.locator('#moonAltSel').selectOption('0');
    await page.locator('#crescentSel').selectOption('0.3');
    await painted();
    expect(coverage([...(await fills(false)), ...(await fills(true))])).toEqual(baseline);
    expect((await fills(true)).length).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-moonlight-crescent-${width}.png`,
      });

    await page.locator('#crescentSel').selectOption('0');
    await painted();
    expect(coverage([...(await fills(false)), ...(await fills(true))])).toEqual(baseline);
    expect(await fills(true)).toEqual([]);
  });
}
