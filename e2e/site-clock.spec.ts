import { chooseMoon, shiftPlanningRange } from './header-controls';
import { expect, test } from '@playwright/test';
import { DEFAULT_SITES } from '../src/app/default-sites';

test.use({ timezoneId: 'Pacific/Auckland' });

test('site clock follows now in the site zone independently of chart selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-10-28T23:59:00Z') });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#siteClockTime')).toHaveText('Oct 28, 4:59 PM PDT (UTC−07:00)');
  await expect(page.locator('#siteClockZone')).toHaveText(' · America/Los_Angeles');
  await expect(page.locator('#siteClockCountdown')).toHaveText(/\d+min to civil twilight/);
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
    await expect(page.locator('#siteClockCountdown')).toHaveText('14min to astronomical twilight');
    await shiftPlanningRange(page, 'Next');
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#siteClockCountdown')).toHaveText('14min to astronomical twilight');
    const selection = await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id);
    const headerHeight = await page
      .locator('.topbar')
      .evaluate((el) => el.getBoundingClientRect().height);
    await page.clock.fastForward(13 * 60_000 + 30_000);
    await expect(page.locator('#siteClockCountdown')).toHaveText('<1min to astronomical twilight');
    await page.clock.fastForward(30_000);
    await expect(page.locator('#siteClockCountdown')).toHaveText(/min to astronomical darkness$/);
    expect(await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height)).toBe(
      headerHeight,
    );
    await page.clock.fastForward(12 * 60 * 60_000);
    await expect(page.locator('#siteClockCountdown')).toHaveText(/to civil twilight$/);
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
  await expect(page.locator('#siteClockCountdown')).toHaveText(/to astronomical twilight$/);
  await page.locator('#siteSel').selectOption('site:sydney-linden-observatory');
  await expect(page.locator('#siteClockTime')).toContainText('Oct 29, 9:30 PM');
  await expect(page.locator('#siteClockCountdown')).toHaveText(/to astronomical twilight$/);
  const sydney = await page.locator('#siteClockCountdown').textContent();
  await page.clock.fastForward(3 * 60 * 60_000);
  await expect(page.locator('#siteClockTime')).toContainText('Oct 30, 12:30 AM');
  await expect(page.locator('#siteClockCountdown')).not.toHaveText(sydney!);
  await expect(page.locator('#siteClockCountdown')).toHaveText(/to astronomical twilight$/);
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
      if (name === 'together') {
        await expect(page.locator('#siteClockCountdown')).toHaveText(
          '14min to astronomical darkness',
        );
        await expect(page.locator('#siteClockUsable')).toHaveText('+ usable dark');
        await expect(page.locator('#siteClock')).toHaveAttribute('data-combined', 'start');
      } else if (name === 'active') {
        await expect(page.locator('#siteClockCountdown')).toHaveText('Usable dark now');
        await expect(page.locator('#siteClockUsable')).toHaveText(
          '2h left, until astronomical twilight',
        );
        await expect(page.locator('#siteClockCountdown')).toHaveClass(/usable-now/);
      } else if (name === 'delayed') {
        await expect(page.locator('#siteClockUsable')).toHaveText(/^usable dark in /);
        await expect(page.locator('#siteClock')).toHaveAttribute('data-combined', '');
      } else {
        await expect(page.locator('#siteClockUsable')).toHaveText('Usable dark now, 14min left');
        await expect(page.locator('#siteClockUsable')).toHaveClass(/usable-now/);
      }
      expect(
        await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height),
      ).toBe(height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (width !== 1512) {
        const compact = page.locator('.site-clock-compact');
        await expect(compact).toBeVisible();
        expect(await compact.evaluate((el) => el.getBoundingClientRect().height)).toBe(34);
        const fits = await compact.evaluate((el) => {
          const clock = el.parentElement!;
          const available = clock.clientWidth - parseFloat(getComputedStyle(clock).paddingRight);
          return el.scrollWidth <= available;
        });
        expect(fits).toBe(true);
        if (name === 'active') {
          await expect(page.locator('#siteClockCompactUsable')).toHaveText('Usable dark now');
          await expect(page.locator('#siteClockCompactPhase')).toHaveText(
            '2h to astronomical twilight',
          );
        } else if (name === 'early-end') {
          await expect(page.locator('#siteClockCompactUsable')).toHaveText('Usable dark, 14m left');
        }
      }
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-usable-status-${name}-${width}.png`,
        });
    }
    await page.clock.fastForward(14 * 60_000);
    await expect(page.locator('#siteClockUsable')).not.toHaveClass(/usable-now/);
    await expect(page.locator('#siteClockUsable')).toBeEmpty();
    expect(
      await page
        .locator('#siteClockUsable')
        .evaluate((el) => getComputedStyle(el, '::before').content),
    ).toBe('none');
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
  await expect(page.locator('#siteClockCountdown')).toHaveText('13min to astronomical darkness');
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
