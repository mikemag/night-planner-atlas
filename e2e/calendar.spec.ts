import { expect, test, type Page } from '@playwright/test';
import { fmtClock, fmtDur, nightTitle } from '../src/model/format';

async function painted(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function open(
  page: Page,
  width = 1512,
  style?: 'hours' | 'windows',
  period = 'month',
  summer = false,
) {
  await page.setViewportSize({ width, height: width < 700 ? 844 : 920 });
  await page.clock.setFixedTime(new Date(summer ? '2026-06-15T03:00:00Z' : '2026-10-28T22:00:00Z'));
  await page.addInitScript(
    ({ style, period, summer }) => {
      localStorage.setItem('npa:view', '"calendar"');
      localStorage.setItem('npa:calZoom', JSON.stringify(period));
      if (style) localStorage.setItem('npa:calMonthStyle', JSON.stringify(style));
      if (summer)
        localStorage.setItem(
          'npa:site',
          JSON.stringify({ name: 'Edinburgh', lat: 55.95, lon: -3.19, tz: 'Europe/London' }),
        );
    },
    { style, period, summer },
  );
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await painted(page);
}
async function choose(page: Page, id: string) {
  await page.evaluate((id) => {
    const a = window.__npa!,
      i = a.nights.findIndex((n) => n.id === id);
    if (i < 0) throw new Error('Test date is outside the loaded range');
    a.select(i, true, true);
  }, id);
  await painted(page);
}
async function point(page: Page, id: string) {
  return page.evaluate((id) => {
    const a = window.__npa!,
      i = a.nights.findIndex((n) => n.id === id),
      r = a.calendarRows,
      b = r.blocks.find((b) => b.t === 'week' && b.wk.includes(i));
    if (!b || b.t !== 'week') throw new Error('Test night is not on this page');
    const c = document.getElementById('cv')!.getBoundingClientRect();
    return { x: c.x + r.geometry.x0 + (b.wk.indexOf(i) + 0.5) * r.geometry.cw, y: c.y + b.y + 14 };
  }, id);
}
async function selected(page: Page) {
  return page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel]);
}
async function fits(page: Page) {
  const result = await page.evaluate(() => {
    const s = document.getElementById('scroller')!,
      cv = document.getElementById('cv')!.getBoundingClientRect();
    return {
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
      scroll: s.scrollHeight - s.clientHeight,
      canvasBottom: cv.bottom,
    };
  });
  expect(result.pageWidth).toBe(result.viewportWidth);
  expect(result.pageHeight).toBeLessThanOrEqual(result.viewportHeight + 1);
  expect(result.canvasBottom).toBeLessThanOrEqual(result.viewportHeight);
  expect(result.scroll).toBeLessThanOrEqual(1);
}
async function sharedDetail(page: Page) {
  const n = await selected(page),
    detail = page.locator('#calendarDetail');
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading')).toHaveText(nightTitle(n));
  await expect(detail.locator('.river-window')).toHaveCount(n.mf.length);
  for (const key of [
    'sunset',
    'civilDusk',
    'nauticalDusk',
    'astroDusk',
    'astroDawn',
    'nauticalDawn',
    'civilDawn',
    'sunrise',
  ] as const)
    if (n.evH[key] != null) await expect(detail).toContainText(fmtClock(n.evH[key]));
  for (const t of n.mfH.flat()) await expect(detail).toContainText(fmtClock(t));
  await expect(page.locator('#riverReadout')).toContainText(
    n.mfMs ? `${fmtDur(n.mfMs)} usable dark` : 'No true dark',
  );
}

for (const width of [1512, 390])
  for (const style of ['hours', 'windows'] as const) {
    test(`a complete six-row ${style}-first month fits at ${width}px and opens the common night detail`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await open(page, width, style);
      await choose(page, '2027-01-01');
      await expect(page.locator('#periodLabel')).toHaveText('January 2027');
      await expect(page.getByRole('combobox', { name: 'Month summary' })).toHaveValue(style);
      expect(await page.evaluate(() => window.__npa!.calendarRows.blocks.length)).toBe(6);
      await fits(page);
      await expect(page.locator('#legend')).toBeHidden();
      await expect(page.locator('#riverWeekends')).toBeHidden();
      await expect(page.locator('#planningOptions')).not.toHaveAttribute('open');
      const backgrounds = await page.evaluate(() => {
        const r = window.__npa!.calendarRows,
          row = r.blocks[1],
          cv = document.getElementById('cv') as HTMLCanvasElement;
        const dpr = cv.width / cv.clientWidth;
        if (row.t !== 'week') throw new Error('Expected month dates');
        return [...Array(7)].map((_, d) =>
          Array.from(
            cv
              .getContext('2d')!
              .getImageData(
                Math.floor((d + 0.5) * r.geometry.cw * dpr),
                Math.floor((row.y + row.h - 5) * dpr),
                1,
                1,
              ).data,
          ).join(','),
        );
      });
      expect(new Set(backgrounds).size).toBe(1);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-calendar-month-${style}-${width}.png`,
        });
      await choose(page, '2026-10-09');
      const p = await point(page, '2026-10-09');
      await page.mouse.click(p.x, p.y);
      await sharedDetail(page);
      const before = await page.locator('#cv').boundingBox();
      await page
        .getByRole('combobox', { name: 'Month summary' })
        .selectOption(style === 'hours' ? 'windows' : 'hours');
      expect(await page.locator('#cv').boundingBox()).toEqual(before);
      await sharedDetail(page);
      await page.locator('#cv').press('ArrowRight');
      await expect(page.locator('#calendarDetail').getByRole('heading')).toHaveText(
        'Sat Oct 10 → Sun Oct 11',
      );
      await page.locator('#cv').press('Escape');
      await expect(page.locator('#calendarDetail')).toBeHidden();
      await page.locator('#cv').press('Enter');
      await expect(page.locator('#calendarDetail')).toBeVisible();
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-calendar-expanded-${style}-${width}.png`,
        });
      await page.getByRole('button', { name: 'Collapse night', exact: true }).click();
      await expect(page.locator('#calendarDetail')).toBeHidden();
      expect(errors).toEqual([]);
    });
  }

test('the saved month presentation survives reload, period changes and resize without changing the night', async ({
  page,
}) => {
  await open(page);
  await choose(page, '2026-10-09');
  const hash = () =>
    page.locator('#cv').evaluate((el) => {
      let h = 2166136261;
      const cv = el as HTMLCanvasElement;
      for (const v of cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data)
        h = Math.imul(h ^ v, 16777619);
      return h >>> 0;
    });
  const before = await hash();
  await page.getByRole('combobox', { name: 'Month summary' }).selectOption('windows');
  expect((await selected(page)).id).toBe('2026-10-09');
  await painted(page);
  const after = await hash();
  expect(after).not.toBe(before);
  expect(await page.evaluate(() => localStorage.getItem('npa:calMonthStyle'))).toBe('"windows"');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Month summary' })).toHaveValue('windows');
  expect((await selected(page)).id).toBe('2026-10-09');
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Month summary' })).toHaveValue('windows');
  await page.getByRole('combobox', { name: 'Month summary' }).selectOption('hours');
  expect(await page.evaluate(() => localStorage.getItem('npa:calMonthStyle'))).toBe('"hours"');
});

for (const width of [1512, 390]) {
  test(`Week fits all seven nights on one sunset-to-sunrise clock at ${width}px`, async ({
    page,
  }, info) => {
    await open(page, width);
    await choose(page, '2026-10-09');
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page.locator('#periodLabel')).toHaveText('Oct 4–10, 2026');
    await expect(page.getByRole('combobox', { name: 'Month summary' })).toHaveCount(0);
    await expect(page.locator('#legend')).toBeVisible();
    await fits(page);
    const extent = await page.evaluate(() => {
      const a = window.__npa!,
        r = a.calendarRows,
        b = r.blocks[0];
      if (b.t !== 'week') throw new Error('Expected week');
      const ns = b.wk.map((i) => a.nights[i]);
      return {
        nights: ns.length,
        earliest: Math.min(...ns.map((n) => n.evH.sunset!)),
        latest: Math.max(...ns.map((n) => n.evH.sunrise!)),
        axis: r.clock,
        year: a.ax,
      };
    });
    expect(extent.nights).toBe(7);
    expect(extent.axis.start).toBeLessThan(extent.earliest);
    expect(extent.axis.end).toBeGreaterThan(extent.latest);
    expect(extent.axis.end - extent.axis.start).toBeLessThan(extent.year!.end - extent.year!.start);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-calendar-week-${width}.png`,
      });
    const p = await point(page, '2026-10-09');
    await page.mouse.click(p.x, p.y);
    await sharedDetail(page);
    await page.getByRole('button', { name: 'Next week', exact: true }).click();
    await expect(page.locator('#periodLabel')).toHaveText('Oct 11–17, 2026');
    await expect(page.locator('#calendarDetail')).toBeHidden();
    await page.getByRole('button', { name: 'Previous week', exact: true }).click();
    await expect(page.locator('#periodLabel')).toHaveText('Oct 4–10, 2026');
  });
  test(`Year fits January–December and has keyboard month choosers at ${width}px`, async ({
    page,
  }, info) => {
    await open(page, width, 'windows', 'year');
    const months = page.locator('button[data-calendar-month]');
    await expect(months).toHaveCount(12);
    await expect(page.locator('#periodLabel')).toHaveText('2026');
    await fits(page);
    const allVisible = await months.evaluateAll((nodes) =>
      nodes.every((node) => {
        const b = node.getBoundingClientRect(),
          c = document.getElementById('cv')!.getBoundingClientRect();
        return b.top >= c.top && b.bottom <= c.bottom && b.left >= c.left && b.right <= c.right;
      }),
    );
    expect(allVisible).toBe(true);
    await expect(page.locator('[data-calendar-month="2026-01"]')).toHaveAccessibleName(
      /January 2026.*usable dark.*New moon 18/,
    );
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-calendar-year-${width}.png`,
      });
    const december = page.locator('[data-calendar-month="2026-12"]');
    await december.focus();
    await december.press('Enter');
    await expect(page.locator('#periodLabel')).toHaveText('December 2026');
    expect((await selected(page)).id).toBe('2026-12-01');
    await expect(page.getByRole('combobox', { name: 'Month summary' })).toHaveValue('windows');
    await page.getByRole('button', { name: 'Year', exact: true }).click();
    await page.getByRole('button', { name: 'Next year', exact: true }).click();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#periodLabel')).toHaveText('2027');
    await expect(page.locator('button[data-calendar-month^="2027-"]')).toHaveCount(12);
    await fits(page);
    await page.getByRole('button', { name: 'Tonight', exact: true }).click();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#periodLabel')).toHaveText('2026');
    expect((await selected(page)).id).toBe('2026-10-28');
    await fits(page);
  });
}

test('adjacent-month activation keeps its month page while unloaded dates cannot open', async ({
  page,
}) => {
  await open(page, 390);
  const p = await point(page, '2026-09-30');
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#periodLabel')).toHaveText('October 2026');
  await expect(page.locator('#calendarDetail').getByRole('heading')).toHaveText(
    'Wed Sep 30 → Thu Oct 1',
  );
  await page.locator('#cv').press('ArrowRight');
  await expect(page.locator('#calendarDetail').getByRole('heading')).toHaveText(
    'Thu Oct 1 → Fri Oct 2',
  );
  await page.locator('#cv').press('Escape');
  await choose(page, '2026-09-01');
  const c = (await page.locator('#cv').boundingBox())!;
  await page.mouse.click(c.x + c.width / 14, c.y + 42);
  expect((await selected(page)).id).toBe('2026-09-01');
  await expect(page.locator('#calendarDetail')).toBeHidden();
});

test('focus and thresholds retain the complete month and update the same shared night details', async ({
  page,
}) => {
  await open(page, 390);
  await choose(page, '2026-10-06');
  await page.locator('#cv').press('Enter');
  const before = await page.evaluate(() =>
    window.__npa!.calendarRows.blocks.map((b) => [b.y, b.h]),
  );
  await page.locator('#planningSummary').click();
  await page.locator('#focusSeg button[data-val="3"]').click();
  await page.locator('#moonAltSel').selectOption('15');
  await page.locator('#crescentSel').selectOption('0.3');
  expect(
    await page.evaluate(() => window.__npa!.calendarRows.blocks.map((b) => [b.y, b.h])),
  ).toEqual(before);
  await expect(page.locator('#calendarDetail')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#planningOptions')).not.toHaveAttribute('open');
  await sharedDetail(page);
  await page.locator('#viewSeg button[data-view="river"]').click();
  await expect(page.locator('#calendarDetail')).toBeHidden();
  await expect(page.locator('#planningSummary')).toBeHidden();
  await expect(page.locator('#planningControls')).toBeVisible();
  expect((await selected(page)).id).toBe('2026-10-06');
  await page.locator('#viewSeg button[data-view="calendar"]').click();
  await sharedDetail(page);
});

test('Calendar marks the civil new-moon date while the lunar views retain their observing-night anchor', async ({
  page,
}) => {
  await open(page);
  await choose(page, '2026-10-10');
  await expect(page.locator('#riverSelection')).toContainText('New moon.');
  await expect(page.locator('#riverReadout')).toContainText('New moon: Oct 10, 2026 8:51 AM');
  await choose(page, '2026-10-09');
  await expect(page.locator('#riverSelection')).not.toContainText('New moon.');
  await page.locator('#viewSeg button[data-view="river"]').click();
  await expect(page.locator('#riverSelection')).toContainText('New moon');
});

test('night details handle no-dark, split windows and daylight-saving changes', async ({
  page,
}) => {
  await open(page, 390, undefined, 'month', true);
  await choose(page, '2026-06-20');
  await page.locator('#cv').press('Enter');
  await expect(page.locator('#calendarDetail')).toContainText('No astronomical darkness');
  await page.locator('#planningSummary').click();
  await page.locator('#moonAltSel').selectOption('15');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const a = window.__npa!,
      i = a.nights.findIndex((n) => n.mf.length > 1);
    if (i < 0) throw new Error('Expected split night');
    a.select(i, true, true);
  });
  await sharedDetail(page);
  await page.evaluate(() => {
    const a = window.__npa!,
      i = a.nights.findIndex((n) => n.dst && n.mfMs > 0);
    a.select(i, true, true);
  });
  await expect(page.locator('#calendarDetail .river-detail-note')).toContainText('Clocks change');
});

test('expanded Week links carry the month preference without saving private fields or recipient defaults', async ({
  page,
  browser,
}) => {
  await open(page, 390, 'windows');
  await choose(page, '2026-10-31');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.locator('#cv').press('Enter');
  await page.locator('#shareBtn').click();
  const link = await page.locator('#shareLink').inputValue(),
    hash = new URL(link).hash;
  expect(hash).toContain('calZoom=week');
  expect(hash).toContain('calMonthStyle=windows');
  expect(hash).toContain('expanded=1');
  expect(hash).not.toMatch(/lat=|lon=|tz=/);
  const context = await browser.newContext({
    timezoneId: 'Pacific/Auckland',
    viewport: { width: 390, height: 844 },
  });
  try {
    const target = await context.newPage();
    await target.clock.setFixedTime(new Date('2028-05-12T00:00:00Z'));
    await target.goto(link);
    await expect(target.locator('#loading')).toBeHidden();
    await expect(target.locator('#calendarDetail').getByRole('heading')).toHaveText(
      'Sat Oct 31 → Sun Nov 1',
    );
    await expect(target.locator('#calendarDetail .river-detail-note')).toContainText(
      'Clocks change',
    );
    await target.getByRole('button', { name: 'Month', exact: true }).click();
    await expect(target.getByRole('combobox', { name: 'Month summary' })).toHaveValue('windows');
    expect(await target.evaluate(() => localStorage.getItem('npa:calMonthStyle'))).toBeNull();
    expect(await target.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  } finally {
    await context.close();
  }
});

test('touch taps toggle a night while moved and canceled gestures cannot open it', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await open(page, 390);
    await choose(page, '2026-10-09');
    const p = await point(page, '2026-10-09');
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator('#calendarDetail')).toBeVisible();
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator('#calendarDetail')).toBeHidden();
    const event = { pointerType: 'touch', pointerId: 42, button: 0, clientX: p.x, clientY: p.y };
    await page.locator('#cv').dispatchEvent('pointerdown', event);
    await page.locator('#cv').dispatchEvent('pointerup', { ...event, clientY: p.y + 30 });
    await expect(page.locator('#calendarDetail')).toBeHidden();
    await page.locator('#cv').dispatchEvent('pointerdown', event);
    await page.locator('#cv').dispatchEvent('pointercancel', event);
    await page.locator('#cv').dispatchEvent('pointerup', event);
    await expect(page.locator('#calendarDetail')).toBeHidden();
  } finally {
    await context.close();
  }
});

test('the month still fits at 320px with all six rows and keyboard-reachable preferences', async ({
  page,
}) => {
  await open(page, 320, 'windows');
  await page.setViewportSize({ width: 320, height: 740 });
  await choose(page, '2027-01-07');
  await fits(page);
  await page.locator('#cv').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('combobox', { name: 'Month summary' })).toBeFocused();
  await page.getByRole('combobox', { name: 'Month summary' }).selectOption('hours');
  await expect(page.getByRole('combobox', { name: 'Month summary' })).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'Month summary' })).toHaveValue('hours');
  expect((await selected(page)).id).toBe('2027-01-07');
  await fits(page);
});

test('a Year chosen during loading publishes a complete year, with no intermediate ready event', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
  await page.addInitScript(() => {
    localStorage.setItem('npa:view', '"calendar"');
    document.addEventListener(
      'click',
      (event) => {
        if ((event.target as Element).closest('button[data-option="calZoom"][data-val="year"]'))
          document.documentElement.dataset.wantsCalendarYear = '1';
      },
      true,
    );
    window.addEventListener('npa-ready', () => {
      if (document.documentElement.dataset.wantsCalendarYear === '1') {
        const root = document.documentElement;
        root.dataset.calendarReadyMonths =
          (root.dataset.calendarReadyMonths ? root.dataset.calendarReadyMonths + ',' : '') +
          document.querySelectorAll('button[data-calendar-month]').length;
      }
    });
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__npa);
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('button[data-calendar-month]')).toHaveCount(12);
  await expect(page.locator('html')).toHaveAttribute('data-calendar-ready-months', '12');
});

test('a long observing-site name keeps the complete phone month inside the viewport', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'npa:site',
      JSON.stringify({
        name: 'A very long observing-site name beside the reservoir and mountain trail',
        lat: 47.60621,
        lon: -122.34253,
        tz: 'America/Los_Angeles',
      }),
    ),
  );
  await open(page, 390);
  await choose(page, '2027-01-01');
  await fits(page);
  await page.getByRole('combobox', { name: 'Observing site', exact: true }).focus();
  await expect(page.getByRole('combobox', { name: 'Observing site', exact: true })).toBeFocused();
});

test('a short tablet viewport keeps twelve readable Year choices instead of squeezing the day grids', async ({
  page,
}) => {
  await open(page, 736, undefined, 'year');
  await page.setViewportSize({ width: 736, height: 740 });
  await painted(page);
  await fits(page);
  await expect(page.locator('#calendarHeaders')).toHaveClass('calendar-compact-year');
  await expect(page.locator('.calendar-year-phases:visible')).toHaveCount(12);
});
