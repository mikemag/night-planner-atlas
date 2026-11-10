import { expect, test, type Page } from '@playwright/test';
import { chooseFocus, chooseMoon } from './header-controls';

declare global {
  interface Window {
    releaseNights?: () => void;
  }
}

async function openFirstMonth(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    let count = 0,
      released = false;
    const held: Array<() => void> = [];
    window.releaseNights = () => {
      released = true;
      for (const send of held) send();
    };
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown) {
        const request = message as { date?: number[] };
        if (request.date && ++count > 31 && !released) held.push(() => super.postMessage(message));
        else super.postMessage(message);
      }
    };
  });
  await page.goto('./');
  await expect(page.locator('#loading')).toHaveClass(/progressive/);
  await expect(page.locator('#loadingText')).toHaveText('Loading · 1/14');
}

for (const width of [1512, 390]) {
  test.describe(`${width}px input`, () => {
    test.use({ hasTouch: width === 390 });
    test(`River publishes a usable month with stable geometry and selection at ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
      await openFirstMonth(page);
      expect(await page.evaluate(() => window.__npa!.pendingNights)).toBe(395);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-progressive-loaded-${width}.png`,
        });
      await page.locator('#cv').press('Enter');
      await expect(page.locator('#riverDetail')).toBeVisible();
      await page.locator('#cv').press('ArrowRight');
      await expect(page.locator('#riverSelection')).toContainText('Thu Oct 29');
      await page.locator('#cv').press('Escape');
      await chooseFocus(page, 3);
      await chooseMoon(page, 'crescentSel', '0.3');
      // A pending row is selectable for navigation, but cannot expose false windows or a detail.
      await page.evaluate(() => {
        const app = window.__npa!;
        const i = app.nights.findIndex((n) => n.id === '2026-12-10');
        app.select(i, true);
        app.toggleRiverNight(i);
      });
      await expect(page.locator('#riverReadout')).toContainText('Still calculating');
      await expect(page.locator('#riverDetail')).toBeHidden();
      const before = await page.evaluate(() => ({
        tops: Array.from(window.__npa!.riverRows.tops),
        heights: Array.from(window.__npa!.riverRows.heights),
        axis: window.__npa!.ax,
        scroll: document.getElementById('scroller')!.scrollTop,
        selected: window.__npa!.S.sel,
      }));
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-progressive-${width}.png`,
        });
      await page.evaluate(() => window.releaseNights!());
      await expect(page.locator('#loading')).toBeHidden();
      const after = await page.evaluate(() => ({
        tops: Array.from(window.__npa!.riverRows.tops),
        heights: Array.from(window.__npa!.riverRows.heights),
        axis: window.__npa!.ax,
        scroll: document.getElementById('scroller')!.scrollTop,
        selected: window.__npa!.S.sel,
      }));
      expect(after).toEqual(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(page.locator('#riverReadout')).not.toContainText('Still calculating');
      await page.locator('#cv').press('Enter');
      await expect(page.locator('#riverDetail')).toBeVisible();
    });

    for (const view of ['calendar', 'lunations']) {
      test(`Moon settings in loading ${view} immediately update completed River nights`, async ({
        page,
      }, info) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
        await openFirstMonth(page);
        await page.evaluate(() => {
          const app = window.__npa!;
          app.select(
            app.nights.findIndex((n) => n.id === '2026-10-15'),
            true,
          );
        });
        await page.locator(`#viewSeg [data-view="${view}"]`).click();
        await chooseMoon(page, 'moonAltSel', '5');
        expect(
          await page.evaluate(() => {
            const n = window.__npa!.nights.find((n) => n.id === '2026-10-15')!;
            return JSON.stringify(n.moonUp) === JSON.stringify(n.moonWindows[5].above);
          }),
        ).toBe(true);
        await chooseMoon(page, 'crescentSel', '0.3');
        expect(
          await page.evaluate(() => {
            const n = window.__npa!.nights.find((n) => n.id === '2026-10-15')!;
            return n.moonIgnored && n.mfMs === n.tdMs;
          }),
        ).toBe(true);
        // Neither assertion may rely on another month arriving or on final publication.
        expect(await page.evaluate(() => window.__npa!.pendingNights)).toBe(395);
        await page.locator('#viewSeg [data-view="river"]').click();
        await page.locator('#cv').press('ArrowRight');
        await page.locator('#cv').press('ArrowLeft');
        await expect(page.locator('#riverReadout')).toContainText('9h 44m usable dark');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        if (process.env.SCREENSHOTS)
          await page.screenshot({
            path: `test-results/screenshots/${info.project.name}-progressive-threshold-${view}-${width}.png`,
          });
        await page.evaluate(() => window.releaseNights!());
        await expect(page.locator('#loading')).toBeHidden();
        await expect(page.locator('#riverReadout')).toContainText('9h 44m usable dark');
        expect(
          await page.evaluate(() =>
            window.__npa!.nights.every(
              (n) =>
                n.moonIgnored === n.illum < 0.3 &&
                JSON.stringify(n.moonUp) === JSON.stringify(n.moonWindows[5].above),
            ),
          ),
        ).toBe(true);
      });
    }
  });
}
