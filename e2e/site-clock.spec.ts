import { chooseMoon, chooseTheme, shiftPlanningRange } from './header-controls';
import { expect, test } from '@playwright/test';
import { DEFAULT_SITES } from '../src/app/default-sites';
import { seedPersonal } from './storage';

test.use({ timezoneId: 'Pacific/Auckland' });

test('site clock follows now in the site zone independently of chart selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-10-28T23:59:00Z') });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteClockTime')).toHaveText('Oct 28, 4:59 PM PDT (UTC−07:00)');
  await expect(page.locator('#siteClockZone')).toHaveText('America/Los_Angeles');
  await expect(page.locator('#siteClockCountdown')).toHaveText(/\d+m until civil twilight/);
  const countdown = await page.locator('#siteClockCountdown').textContent();
  await page.evaluate(() => window.__npa!.select(0, true));
  await expect(page.locator('#siteClock')).toContainText('Oct 28, 4:59 PM');
  const height = await page
    .locator('#siteClock')
    .evaluate((el) => el.getBoundingClientRect().height);
  await page.clock.fastForward(60_000);
  await expect(page.locator('#siteClock')).toContainText('Oct 28, 5:00 PM');
  await expect(page.locator('#siteClockCountdown')).not.toHaveText(countdown!);
  expect(await page.locator('#siteClock').evaluate((el) => el.getBoundingClientRect().height)).toBe(
    height,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

for (const width of [1512, 390]) {
  test(`countdown advances at twilight without reloading or moving the chart at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.clock.install({ time: new Date('2026-10-29T01:50:00Z') });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    const next = await page.evaluate(
      () => window.__npa!.nights.find((n) => n.id === '2026-10-28')!.ev.nauticalDusk!,
    );
    await page.clock.setSystemTime(new Date(next - 14 * 60_000));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#siteClockCountdown')).toHaveText('14m until astronomical twilight');
    await shiftPlanningRange(page, 'Next');
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteClockCountdown')).toHaveText('14m until astronomical twilight');
    const selection = await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id);
    const headerHeight = await page
      .locator('.topbar')
      .evaluate((el) => el.getBoundingClientRect().height);
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
    await page.clock.setSystemTime(new Date(next - 14 * 60_000));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.clock.fastForward(13 * 60_000 + 30_000);
    await expect(page.locator('#siteClockCountdown')).toHaveText(
      '0m 30s until astronomical twilight',
    );
    await page.clock.fastForward(30_000);
    await expect(page.locator('#siteClockCountdown')).toHaveText(/m until astronomical darkness$/);
    expect(await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height)).toBe(
      headerHeight,
    );
    await page.clock.fastForward(12 * 60 * 60_000);
    await expect(page.locator('#siteClockCountdown')).toHaveText(/until civil twilight$/);
    expect(await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id)).toBe(selection);
    expect(await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height)).toBe(
      headerHeight,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('countdown catches up on return, changes with the site and survives midnight offline', async ({
  page,
  context,
}) => {
  await page.clock.install({ time: new Date('2026-10-28T23:59:00Z') });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await context.setOffline(true);
  await page.clock.setSystemTime(new Date('2026-10-29T10:30:00Z'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#siteClockTime')).toContainText('Oct 29, 3:30 AM');
  await expect(page.locator('#siteClockCountdown')).toHaveText(/until astronomical twilight$/);
  await page.locator('#siteSel').selectOption('site:sydney-linden-observatory');
  await expect(page.locator('#siteClockTime')).toContainText('Oct 29, 9:30 PM');
  await expect(page.locator('#siteClockCountdown')).toHaveText(/until astronomical twilight$/);
  const sydney = await page.locator('#siteClockCountdown').textContent();
  await page.clock.fastForward(3 * 60 * 60_000);
  await expect(page.locator('#siteClockTime')).toContainText('Oct 30, 12:30 AM');
  await expect(page.locator('#siteClockCountdown')).not.toHaveText(sydney!);
  await expect(page.locator('#siteClockCountdown')).toHaveText(/until astronomical twilight$/);
});

for (const width of [1512, 390, 320, 568, 844]) {
  test(`usable status shares chart calculations and keeps its height through every transition at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({
      width,
      height: width === 1512 ? 920 : width === 568 ? 320 : width === 844 ? 390 : 844,
    });
    await page.clock.install({ time: new Date('2026-10-28T22:00:00Z') });
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__npa);
    const height = await page
      .locator('.topbar')
      .evaluate((el) => el.getBoundingClientRect().height);
    await expect(page.locator('#loading')).toBeHidden();
    const cases = await page.evaluate(() => {
      const app = window.__npa!;
      const nights = app.nights.filter((n) => n.noon > Date.now() && n.mf.length === 1);
      return {
        together: nights.find(
          (n) => n.mf[0][0] === n.ev.astroDusk && n.mf[0][1] === n.ev.astroDawn,
        )!,
        delayed: nights.find((n) => n.mf[0][0] > n.ev.astroDusk! + 20 * 60_000)!,
        earlyEnd: nights.find((n) => n.mf[0][1] < n.ev.astroDawn! - 20 * 60_000)!,
        calculated: app.calculatedNights,
        total: app.nights.length,
      };
    });
    expect(cases.calculated).toBe(cases.total);
    for (const [name, time] of [
      ['together', cases.together.ev.astroDusk! - 14 * 60_000],
      ['active', cases.together.ev.astroDawn! - 2 * 60 * 60_000],
      ['delayed', cases.delayed.ev.astroDusk! - 14 * 60_000],
      ['early-end', cases.earlyEnd.mf[0][1] - 14 * 60_000],
    ] as const) {
      await page.clock.setSystemTime(new Date(time));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      if (width === 1512) {
        await expect(page.locator('#siteClockDesktopTime')).toBeVisible();
        const clock = (await page.locator('#siteClockDesktopTime').boundingBox())!;
        const site = (await page.locator('#siteSel').boundingBox())!;
        expect(clock.x).toBe(site.x);
        expect(clock.y).toBeGreaterThan(site.y + site.height);
        await expect(page.locator('#siteClockPrimary')).not.toContainText('Now at site');
        const usable = page.locator('#siteClockDesktopUsable');
        if (name === 'together' || name === 'delayed') await expect(usable).toBeHidden();
        else {
          await expect(usable).toBeVisible();
          const statusBounds = (await usable.boundingBox())!;
          const countdown = (await page.locator('#siteClockPrimary').boundingBox())!;
          expect(statusBounds.x - clock.x - clock.width).toBeLessThanOrEqual(16);
          expect(countdown.x - statusBounds.x - statusBounds.width).toBeLessThanOrEqual(16);
          await expect(usable).toHaveText('Usable dark now');
        }
      }
      if (name === 'together') {
        await expect(page.locator('#siteClockCountdown')).toHaveText(
          '14m until astronomical darkness',
        );
        await expect(page.locator('#siteClockUsable')).toHaveText('+ usable dark');
        await expect(page.locator('#siteClock')).toHaveAttribute('data-combined', 'start');
      } else if (name === 'active') {
        await expect(page.locator('#siteClockCountdown')).toHaveText('Usable dark now');
        await expect(page.locator('#siteClockUsable')).toHaveText('2h until astronomical twilight');
        await expect(page.locator('#siteClockCountdown')).toHaveClass(/usable-now/);
        await expect(page.locator('#siteClockEvent')).toHaveText('until astronomical twilight');
        await expect(page.locator('#siteClockSecondary')).toBeEmpty();
      } else if (name === 'delayed') {
        await expect(page.locator('#siteClockUsable')).toHaveText(/^usable dark in /);
        await expect(page.locator('#siteClock')).toHaveAttribute('data-combined', '');
      } else {
        await expect(page.locator('#siteClockUsable')).toHaveText('Usable dark now, ends in 14m');
        await expect(page.locator('#siteClockUsable')).toHaveClass(/usable-now/);
        await expect(page.locator('#siteClockDuration')).toHaveText('14m');
        await expect(page.locator('#siteClockEvent')).toHaveText('until usable dark ends');
        await expect(page.locator('#siteClockSecondary')).toHaveText(
          /until astronomical twilight$/,
        );
      }
      expect(
        await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height),
      ).toBe(height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(page.locator('#siteClockEvent')).toHaveText(/^until /);
      const fits = await page.locator('#siteClock').evaluate((el) => {
        const primary = el.querySelector('#siteClockPrimary')!.getBoundingClientRect();
        const toggle = el.querySelector('#siteClockToggle')!.getBoundingClientRect();
        return primary.right <= (toggle.width ? toggle.right : el.getBoundingClientRect().right);
      });
      expect(fits).toBe(true);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-usable-status-${name}-${width}.png`,
        });
    }
    await page.clock.fastForward(14 * 60_000);
    await expect(page.locator('#siteClockUsable')).not.toHaveClass(/usable-now/);
    await expect(page.locator('#siteClockUsable')).toBeEmpty();
    expect(await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height)).toBe(
      height,
    );
    expect(await page.evaluate(() => window.__npa!.calculatedNights)).toBe(cases.calculated);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-usable-status-ended-${width}.png`,
      });
  });
}

test('usable countdown stays within tonight and resumes for the next night at noon', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-26T02:00:00Z') });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteClockCountdown')).toHaveText('13m until astronomical darkness');
  await expect(page.locator('#siteClockUsable')).toBeEmpty();
  const calculated = await page.evaluate(() => window.__npa!.calculatedNights);
  for (const time of ['2026-11-26T08:00:00Z', '2026-11-26T19:59:00Z']) {
    await page.clock.setSystemTime(new Date(time));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#siteClockUsable')).toBeEmpty();
  }
  await page.clock.fastForward(60_000);
  await expect(page.locator('#siteClockUsable')).toHaveText(/^usable dark in /);
  await page.clock.setSystemTime(new Date('2026-11-27T02:00:00Z'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#siteClockUsable')).toHaveText('+ usable dark');
  await page.clock.fastForward(6 * 60 * 60_000);
  await expect(page.locator('#siteClockUsable')).toBeEmpty();
  expect(await page.evaluate(() => window.__npa!.calculatedNights)).toBe(calculated);
});

test('Moon settings immediately update shared transitions, including while browsing another year', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-28T22:00:00Z') });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const at = await page.evaluate(
    () =>
      window.__npa!.nights.find(
        (n) =>
          n.noon > Date.now() &&
          n.illum < 0.3 &&
          n.mf.length &&
          n.mf[0][0] > n.ev.astroDusk! + 60_000,
      )!.ev.astroDusk! -
      14 * 60_000,
  );
  await page.clock.setSystemTime(new Date(at));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const before = await page.locator('#siteClockUsable').textContent();
  const computed = await page.evaluate(() => window.__npa!.calculatedNights);
  await chooseMoon(page, 'moonAltSel', '15');
  await expect(page.locator('#siteClockUsable')).not.toHaveText(before!);
  await chooseMoon(page, 'crescentSel', '0.3');
  await expect(page.locator('#siteClockUsable')).toHaveText('+ usable dark');
  expect(await page.evaluate(() => window.__npa!.calculatedNights)).toBe(computed);
  await shiftPlanningRange(page, 'Next');
  await expect(page.locator('#loading')).toBeHidden();
  const browsed = await page.evaluate(() => window.__npa!.calculatedNights);
  await chooseMoon(page, 'moonAltSel', '0');
  await chooseMoon(page, 'crescentSel', '0');
  await expect(page.locator('#siteClockUsable')).toHaveText(before!);
  await chooseMoon(page, 'crescentSel', '0.3');
  await expect(page.locator('#siteClockUsable')).toHaveText('+ usable dark');
  expect(await page.evaluate(() => window.__npa!.calculatedNights)).toBe(browsed);
});

for (const [time, monthDays, expected] of [
  ['2026-10-29T22:00:00Z', 31, /^usable dark in /],
  ['2026-12-01T08:00:00Z', 30, ''],
] as const) {
  test(`a historical plan loads only the needed live month and reuses it later at ${time}`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date(time));
    const { name, lat, lon, tz, elevation } = DEFAULT_SITES[0];
    const site = { name, lat, lon, tz, elevation };
    const plan = {
      v: 1,
      view: 'river',
      riverZoom: 'month',
      calZoom: 'month',
      calOrient: 'v',
      focus: 0,
      moonAlt: 0,
      crescent: 0,
      start: '2020-01',
      night: null,
      expanded: false,
      site,
    };
    await page.goto('./#npa=' + encodeURIComponent(JSON.stringify(plan)));
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteClockUsable')).toHaveText(expected);
    const computed = await page.evaluate(() => window.__npa!.calculatedNights);
    const historical = await page.evaluate(() => window.__npa!.nights.length);
    expect(computed).toBe(historical + monthDays);
    await page.getByRole('button', { name: 'Tonight', exact: true }).click();
    await expect(page.locator('#loading')).toBeHidden();
    const current = await page.evaluate(() => ({
      count: window.__npa!.nights.length,
      total: window.__npa!.calculatedNights,
    }));
    expect(current.total - computed).toBe(current.count - monthDays);
  });
}

test('seconds tick quietly without repainting the chart and live details support keyboard dismissal', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-10-28T22:00:00Z') });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const at = await page.evaluate(
    () => window.__npa!.nights.find((n) => n.id === '2026-10-28')!.ev.nauticalDusk!,
  );
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.clock.setSystemTime(new Date(at - 5 * 60_000 - 100));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#siteClockDuration')).toHaveText('6m');
  await page.clock.fastForward(100);
  await expect(page.locator('#siteClockDuration')).toHaveText('5m 00s');
  await page.clock.fastForward(1000);
  await expect(page.locator('#siteClockDuration')).toHaveText('4m 59s');
  await page.locator('#cv').evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    const fill = context.fillRect.bind(context);
    canvas.dataset.liveTestPaints = '0';
    context.fillRect = (...args) => {
      canvas.dataset.liveTestPaints = String(Number(canvas.dataset.liveTestPaints) + 1);
      fill(...args);
    };
  });
  const title = await page.locator('#siteClockEvent').boundingBox();
  await page.clock.fastForward(1000);
  await expect(page.locator('#siteClockDuration')).toHaveText('4m 58s');
  await expect(page.locator('#cv')).toHaveAttribute('data-live-test-paints', '0');
  expect(await page.locator('#siteClockEvent').boundingBox()).toEqual(title);
  await expect(page.locator('#siteClock [aria-live], #siteClock [role="status"]')).toHaveCount(0);
  const chartHeight = await page.locator('#scroller').evaluate((el) => el.clientHeight);
  const selected = await page.evaluate(() => window.__npa!.S.sel);
  const trigger = page.getByRole('button', { name: 'Live details', exact: true });
  await expect(trigger).toHaveAccessibleDescription('4m 58s until astronomical twilight');
  await expect(trigger.locator('#siteClockDuration')).toBeVisible();
  const siteLeft = (await page.locator('#siteSel').boundingBox())!.x;
  expect((await trigger.boundingBox())!.x).toBe(siteLeft);
  expect((await page.locator('#siteClockDuration').boundingBox())!.x).toBe(siteLeft);
  await trigger.focus();
  await trigger.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#siteClockTime')).toBeVisible();
  await expect(page.locator('#siteClockZone')).toBeVisible();
  await expect(page.locator('#siteClockCountdown')).toContainText('4m 58s');
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-live-details.png`,
    });
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(selected);
  await page.keyboard.press('Escape');
  await expect(page.locator('#siteClockDetails')).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.locator('#scroller').evaluate((el) => el.clientHeight)).toBe(chartHeight);
  await page.locator('#siteClockDuration').click();
  await expect(page.locator('#siteClockDetails')).toBeVisible();
  await page.getByRole('heading', { name: 'Night Planner Atlas', exact: true }).click();
  await expect(page.locator('#siteClockDetails')).toBeHidden();
});

for (const [width, height] of [
  [1512, 920],
  [1920, 1080],
  [390, 844],
  [844, 390],
  [320, 568],
  [568, 320],
]) {
  test(`prominent live header fits all views and palettes at ${width}×${height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await seedPersonal(page, {
      site: {
        ...DEFAULT_SITES[0],
        name: 'A very long observing-site name beside the northern trail and telescope field',
      },
    });
    await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    const at = await page.evaluate(
      () => window.__npa!.nights.find((n) => n.id === '2026-10-28')!.ev.astroDusk!,
    );
    await page.clock.setFixedTime(new Date(at - 299_000));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    for (const theme of ['light', 'dark', 'observing']) {
      await chooseTheme(page, theme);
      for (const view of ['river', 'lunations', 'calendar', 'weekends']) {
        await page.locator(`#viewSeg button[data-view="${view}"]`).click();
        await expect(page.locator('#siteClockDuration')).toHaveText('4m 59s');
        await expect(page.locator('#siteClockEvent')).toHaveText('until astronomical darkness');
        const geometry = await page.evaluate(() => {
          const stage = document.getElementById('stage')!.getBoundingClientRect();
          const primaryElement = document.getElementById('siteClockPrimary')!;
          const primary = primaryElement.getBoundingClientRect();
          const toggle = document.getElementById('siteClockToggle')!.getBoundingClientRect();
          return {
            width: document.documentElement.scrollWidth,
            stageCenter: stage.x + stage.width / 2,
            contentFits: primaryElement.scrollWidth <= primaryElement.clientWidth,
            primaryRight: primary.right,
            limit: toggle.width ? toggle.right : innerWidth,
            headerHeight: document.querySelector('.topbar')!.getBoundingClientRect().height,
          };
        });
        expect(geometry.width).toBe(width);
        expect(geometry.contentFits).toBe(true);
        expect(geometry.primaryRight).toBeLessThanOrEqual(geometry.limit);
        if (view === 'weekends') expect(Math.abs(geometry.stageCenter - width / 2)).toBeLessThan(1);
        if (width === 390) expect(geometry.headerHeight).toBeLessThanOrEqual(166);
        if (process.env.SCREENSHOTS)
          await page.screenshot({
            path: `test-results/screenshots/${info.project.name}-live-${width}-${view}-${theme}.png`,
          });
      }
    }
  });
}

test('long polar countdowns and full zone details fit a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await seedPersonal(page, { site: DEFAULT_SITES[5] });
  await page.clock.setFixedTime(new Date('2026-06-21T12:00:00Z'));
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteClockDuration')).toContainText('d');
  await expect(page.locator('#siteClockEvent')).toHaveText('until civil twilight');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const fits = await page
    .locator('#siteClockPrimary')
    .evaluate(
      (el) =>
        el.getBoundingClientRect().right <=
        document.getElementById('siteClockToggle')!.getBoundingClientRect().right,
    );
  expect(fits).toBe(true);
  await page.getByRole('button', { name: 'Live details', exact: true }).click();
  await expect(page.locator('#siteClockZone')).toHaveText(DEFAULT_SITES[5].tz);
  await expect(page.locator('#siteClockUsable')).toBeEmpty();
  const details = (await page.locator('#siteClockDetails').boundingBox())!;
  expect(details.x).toBeGreaterThanOrEqual(0);
  expect(details.x + details.width).toBeLessThanOrEqual(320);
});

for (const width of [1512, 390, 320]) {
  test(`nearest countdown moves from twilight to Moonset and back to dawn at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width > 700 ? 920 : 844 });
    await page.clock.install({ time: new Date('2026-11-16T00:00:00Z') });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    const n = await page.evaluate(() => window.__npa!.nights.find((n) => n.id === '2026-11-15')!);
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
    await page.clock.setSystemTime(new Date('2026-11-16T04:05:00Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#siteClockDuration')).toHaveText('1h 46m');
    await expect(page.locator('#siteClockEvent')).toHaveText('until usable dark');
    await expect(page.locator('#siteClockSecondary')).toHaveText(
      '9h 24m until astronomical twilight',
    );
    const height = await page.locator('.topbar').evaluate((el) => el.clientHeight);
    await page.clock.setSystemTime(new Date(Math.ceil(n.mf[0][0]) - 30_000));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#siteClockDuration')).toHaveText('0m 30s');
    await page.clock.fastForward(30_000);
    await expect(page.locator('#siteClockEvent')).toHaveText('until astronomical twilight');
    await expect(page.locator('#siteClockDesktopUsable')).toHaveText('Usable dark now');
    await expect(page.locator('#siteClockSecondary')).toBeEmpty();
    await page.clock.setSystemTime(new Date(n.ev.astroDawn! - 30_000));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#siteClockDuration')).toHaveText('0m 30s');
    await page.clock.fastForward(30_000);
    await expect(page.locator('#siteClockEvent')).toHaveText('until nautical twilight');
    await expect(page.locator('#siteClockDesktopUsable')).toBeEmpty();
    expect(await page.locator('.topbar').evaluate((el) => el.clientHeight)).toBe(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
