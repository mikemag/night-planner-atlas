import { openShare, chooseFocus, chooseMoon, shiftPlanningRange } from './header-controls';
import { seedPersonal } from './storage';
import { expect, test, coldTest, type Page } from './ui-test';
import { fmtClock, fmtClockS, fmtDur, nightTitle, SUN_NAMES } from '../src/model/format';
import { SUN_EVENTS } from '../src/model/night';

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
  await seedPersonal(page, {
    preferences: { view: 'calendar', calZoom: period as 'month' },
    ...(summer ? { site: { name: 'Edinburgh', lat: 55.95, lon: -3.19, tz: 'Europe/London' } } : {}),
  });
  if (style)
    await page.addInitScript(
      (style) => localStorage.setItem('npa:calMonthStyle', JSON.stringify(style)),
      style,
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
      st = document.getElementById('scroller')!.scrollTop,
      b =
        r.blocks.find(
          (b) =>
            b.t === 'week' &&
            b.wk.includes(i) &&
            b.y >= st - 1 &&
            b.y < st + document.getElementById('scroller')!.clientHeight,
        ) ?? r.blocks.find((b) => b.t === 'week' && b.wk.includes(i) && b.mo.idx.includes(i));
    if (!b || b.t !== 'week') throw new Error('Test night is not on this page');
    const c = document.getElementById('cv')!.getBoundingClientRect();
    return {
      x: c.x + r.geometry.x0 + (b.wk.indexOf(i) + 0.5) * r.geometry.cw,
      y: c.y + b.y - st + 14,
    };
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
  const year = await page.evaluate(() => window.__npa!.S.calZoom === 'year');
  if (!year) expect(result.scroll).toBeGreaterThan(result.viewportHeight);
}
async function sharedDetail(page: Page) {
  // The readout intentionally previews pointer hover; isolate the selected-night checks.
  await page.mouse.move(0, 0);
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
    n.mfMs ? `${fmtDur(n.mfMs)} usable dark` : 'No astronomical darkness',
  );
}

for (const width of [1512, 390]) {
  test(`a six-row month keeps readable cells at ${width}px with inset duration bars and inline detail @retina @dark`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, width, 'windows');
    await choose(page, '2027-01-07');
    await expect(page.locator('#periodLabel')).toHaveText('January 2027');
    await expect(page.getByRole('combobox', { name: 'Month summary' })).toHaveCount(0);
    const overview = await page.evaluate(() => {
      const a = window.__npa!,
        r = a.calendarRows,
        s = document.getElementById('scroller')!,
        rows = r.blocks.filter((b) => b.t === 'week' && b.mo.key === '2027-01'),
        p = r.periods.find((p) => p.key === '2027-01')!;
      return { rows: rows.length, height: p.base, available: s.clientHeight };
    });
    expect(overview.rows).toBe(6);
    expect(overview.height).toBeLessThanOrEqual(Math.max(546, overview.available) + 1);
    await fits(page);
    await expect(page.locator('#legend')).toBeHidden();
    await expect(
      page.locator(width <= 700 ? '#planSettingsBtn' : '#planningControls'),
    ).toBeVisible();
    const pixels = await page.evaluate(() => {
      const a = window.__npa!,
        r = a.calendarRows,
        i = a.nights.findIndex((n) => n.id === '2027-01-07'),
        row = r.blocks.find((b) => b.t === 'week' && b.mo.key === '2027-01' && b.wk.includes(i))!,
        cv = document.getElementById('cv') as HTMLCanvasElement,
        c = cv.getContext('2d')!,
        dpr = cv.width / cv.clientWidth,
        st = document.getElementById('scroller')!.scrollTop;
      if (row.t !== 'week') throw new Error('Expected month row');
      const x = row.wk.indexOf(i) * r.geometry.cw,
        y = row.y + row.base - 10 - st,
        pixel = (x: number, y: number) =>
          Array.from(c.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data)
            .slice(0, 3)
            .join(','),
        hex = getComputedStyle(document.documentElement).getPropertyValue('--good').trim().slice(1),
        green = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
      return {
        green,
        bar: pixel(x + r.geometry.cw - 6, y),
        innerBar: pixel(x + r.geometry.cw - 20, y),
        left: pixel(x + 3, y),
        right: pixel(x + r.geometry.cw - 2, y),
        backgrounds: [...Array(7)].map((_, d) =>
          pixel((d + 0.5) * r.geometry.cw, row.y + row.base - 3 - st),
        ),
      };
    });
    expect(pixels.bar).toBe(pixels.green);
    if (width === 1512) expect(pixels.innerBar).toBe(pixels.green);
    expect(pixels.left).not.toBe(pixels.green);
    expect(pixels.right).not.toBe(pixels.green);
    expect(new Set(pixels.backgrounds).size).toBe(1);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-calendar-month-${width}.png`,
      });
    await choose(page, '2026-10-31');
    const p = await point(page, '2026-10-31');
    await page.mouse.click(p.x, p.y);
    await sharedDetail(page);
    const geometry = await page.evaluate(() => {
      const a = window.__npa!,
        r = a.calendarRows,
        row = r.blocks.find((b) => b.t === 'week' && b.key === a.S.calendarWeek)!,
        following = r.blocks.find((b) => b.y > row.y),
        detail = document.getElementById('calendarDetail')!.getBoundingClientRect(),
        cv = document.getElementById('cv')!.getBoundingClientRect();
      if (row.t !== 'week') throw new Error('Expected expanded row');
      return {
        start: r.detailTop,
        rowEnd: row.y + row.base,
        next: following?.y,
        end: row.y + row.h,
        bottom: detail.bottom,
        canvasBottom: cv.bottom,
      };
    });
    expect(geometry.start).toBe(geometry.rowEnd);
    expect(geometry.next).toBeGreaterThanOrEqual(geometry.end);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.canvasBottom + 1);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-calendar-expanded-${width}.png`,
      });
    await page.locator('#cv').press('ArrowRight');
    await expect(page.locator('#calendarDetail').getByRole('heading')).toHaveText(
      'Sun Nov 1 → Mon Nov 2',
    );
    await page.locator('#cv').press('Escape');
    await expect(page.locator('#calendarDetail')).toBeHidden();
    await page.locator('#cv').press('Enter');
    await sharedDetail(page);
    await page.getByRole('button', { name: 'Collapse night', exact: true }).click();
    await expect(page.locator('#calendarDetail')).toBeHidden();
    expect(errors).toEqual([]);
  });
  test(`wheel scrolling browses months without changing the selected night at ${width}px`, async ({
    page,
  }) => {
    await open(page, width);
    await choose(page, '2026-10-09');
    const distance = await page.evaluate(
      () => window.__npa!.calendarRows.periods.find((p) => p.key === '2026-10')!.h + 38,
    );
    await page.locator('#scroller').hover();
    await page.mouse.wheel(0, distance);
    await expect(page.locator('#periodLabel')).toHaveText('November 2026');
    expect((await selected(page)).id).toBe('2026-10-09');
    await page.setViewportSize({ width, height: width < 700 ? 860 : 940 });
    await painted(page);
    await expect(page.locator('#periodLabel')).toHaveText('November 2026');
    await page.locator('#scroller').hover();
    const back = await page.evaluate(
      () =>
        document.getElementById('scroller')!.scrollTop -
        window.__npa!.calendarRows.periods.find((p) => p.key === '2026-10')!.y -
        20,
    );
    await page.mouse.wheel(0, -back);
    await expect(page.locator('#periodLabel')).toHaveText('October 2026');
    await page.mouse.wheel(0, distance);
    await expect(page.locator('#periodLabel')).toHaveText('November 2026');
    expect((await selected(page)).id).toBe('2026-10-09');
  });
}

test('Month defaults with Year / Month / Week order and ignores the retired preference', async ({
  page,
}) => {
  await open(page, 1512, 'windows');
  await expect(page.locator('#viewCtl [data-option="calZoom"]')).toHaveText([
    'Year',
    'Month',
    'Week',
  ]);
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('combobox', { name: 'Month summary' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('npa:calMonthStyle'))).toBe('"windows"');
  await choose(page, '2026-10-09');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  expect((await selected(page)).id).toBe('2026-10-09');
});

for (const width of [1512, 390]) {
  test(`Week fits all seven nights on one sunset-to-sunrise clock at ${width}px @retina @dark`, async ({
    page,
  }, info) => {
    await open(page, width);
    await choose(page, '2026-10-09');
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page.locator('#periodLabel')).toHaveText('Oct 4–10, 2026');
    await expect(page.getByRole('combobox', { name: 'Month summary' })).toHaveCount(0);
    await expect(page.locator('#legendBtn')).toBeVisible();
    if (width > 1100) await expect(page.locator('#legend')).toBeVisible();
    else await expect(page.locator('#legend')).toBeHidden();
    await fits(page);
    const extent = await page.evaluate(() => {
      const a = window.__npa!,
        r = a.calendarRows,
        b = r.blocks.find((b) => b.t === 'week' && b.wk.includes(a.S.sel))!;
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
    const labels = await page.evaluate(() => {
      const a = window.__npa!,
        r = a.calendarRows;
      return r.annotations
        .filter((e) => e.i === a.S.sel)
        .map((e) => ({
          name: e.name,
          y: e.y,
          x: e.x,
          w: e.w,
          time: e.time,
          leader: e.leader,
          anchor: e.anchor,
        }));
    });
    expect(labels.map((e) => e.name)).toEqual(
      expect.arrayContaining([
        'Sunset',
        'Civil dusk',
        'Nautical dusk',
        'Astro dusk',
        'Astro dawn',
        'Nautical dawn',
        'Civil dawn',
        'Sunrise',
      ]),
    );
    expect(labels).toHaveLength(8);
    const paintedEdges = await page.evaluate(() => {
      const a = window.__npa!,
        darkMoon = a.nights.findIndex((n) => n.id === '2026-10-04'),
        daylightMoon = a.nights.findIndex((n) => n.id === '2026-10-10');
      return {
        intrusion: a.nights[darkMoon].mfH[0][1],
        darkTimes: a.calendarRows.annotations.filter((e) => e.i === darkMoon).map((e) => e.time),
        daylightLabels: a.calendarRows.annotations.filter((e) => e.i === daylightMoon).length,
      };
    });
    // A Moon intrusion during astronomical darkness has a painted edge; daytime rise/set adds no extra label.
    expect(paintedEdges.darkTimes).toContain(fmtClockS(paintedEdges.intrusion));
    expect(paintedEdges.daylightLabels).toBe(8);
    const night = await selected(page);
    SUN_EVENTS.forEach((key, i) => {
      if (night.evH[key] != null)
        expect(labels.find((e) => e.name === SUN_NAMES[i])?.time).toBe(fmtClockS(night.evH[key]));
    });
    for (let k = 1; k < labels.length; k++)
      expect(labels[k].y - labels[k - 1].y).toBeGreaterThanOrEqual(21.9);
    for (const e of labels) {
      expect(e.leader).toBe(Math.abs(e.y - e.anchor) > 0.75);
      expect(e.x).toBeGreaterThanOrEqual(42);
      expect(e.x + e.w).toBeLessThanOrEqual(width - 16);
    }
    const p = await point(page, '2026-10-09');
    await page.mouse.click(p.x, p.y);
    await sharedDetail(page);
    await page.locator('#scroller').hover();
    const distance = await page.locator('#scroller').evaluate((el) => el.clientHeight + 300);
    await page.mouse.wheel(0, distance);
    await expect(page.locator('#periodLabel')).toHaveText('Oct 11–17, 2026');
    expect((await selected(page)).id).toBe('2026-10-09');
    await page.mouse.wheel(0, -distance);
    await expect(page.locator('#periodLabel')).toHaveText('Oct 4–10, 2026');
    await expect(page.locator('#calendarDetail')).toBeVisible();
    expect((await selected(page)).id).toBe('2026-10-09');
  });
  test(`Year keeps all loaded months accessible with keyboard month choosers at ${width}px @retina @dark`, async ({
    page,
  }, info) => {
    await open(page, width, 'windows', 'year');
    const months = page.locator('button[data-calendar-month]');
    await expect(months).toHaveCount(14);
    await expect(page.locator('#periodLabel')).toHaveText('2026–2027');
    await fits(page);
    const allVisible = await months.evaluateAll((nodes) =>
      nodes.every((node) => {
        const b = node.getBoundingClientRect(),
          c = document.getElementById('cv')!.getBoundingClientRect();
        return b.top >= c.top && b.bottom <= c.bottom && b.left >= c.left && b.right <= c.right;
      }),
    );
    if (width > 1000) expect(allVisible).toBe(true);
    else {
      // The shared phone header leaves less height; retain readable month choices and scroll.
      await months.last().focus();
      await expect(months.last()).toBeInViewport();
      await months.first().focus();
      await expect(months.first()).toBeInViewport();
    }
    await expect(page.locator('[data-calendar-month="2026-09"]')).toHaveAccessibleName(
      /September 2026.*usable dark.*New moon/,
    );
    if (width > 1000) {
      const visual = await months.first().evaluate((node) => {
        const cv = document.getElementById('cv') as HTMLCanvasElement,
          data = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data,
          hex = getComputedStyle(document.documentElement)
            .getPropertyValue('--good')
            .trim()
            .slice(1),
          rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
        let green = 0;
        for (let i = 0; i < data.length; i += 4)
          if (rgb.every((v, k) => v === data[i + k])) green++;
        return {
          font: parseFloat(getComputedStyle(node.querySelector('strong')!).fontSize),
          green,
        };
      });
      expect(visual.font).toBeGreaterThanOrEqual(18);
      expect(visual.green).toBeGreaterThan(100);
    }
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-calendar-year-${width}.png`,
      });
    const december = page.locator('[data-calendar-month="2026-12"]');
    await december.focus();
    await december.press('Enter');
    await expect(page.locator('#periodLabel')).toHaveText('December 2026');
    expect((await selected(page)).id).toBe('2026-12-01');
    await expect(page.getByRole('combobox', { name: 'Month summary' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Year', exact: true }).click();
    await shiftPlanningRange(page, 'Next');
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#periodLabel')).toHaveText('2027–2028');
    await expect(page.locator('button[data-calendar-month^="2027-"]')).toHaveCount(4);
    await fits(page);
    await page.getByRole('button', { name: 'Tonight', exact: true }).click();
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#periodLabel')).toHaveText('2026–2027');
    expect((await selected(page)).id).toBe('2026-10-28');
    await fits(page);
  });
}

test('adjacent-month activation keeps its month page while unloaded dates cannot open', async ({
  page,
}) => {
  await open(page, 390);
  await choose(page, '2026-10-01');
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
  await page.mouse.click(c.x + c.width / 14, c.y + 68);
  expect((await selected(page)).id).toBe('2026-09-01');
  await expect(page.locator('#calendarDetail')).toBeHidden();
});

for (const width of [1512, 390]) {
  test(`Month arrows cross straight to real dates instead of placeholders at ${width}px`, async ({
    page,
  }) => {
    await open(page, width);
    await choose(page, '2026-10-01');
    await page.locator('#cv').press('ArrowLeft');
    await expect(page.locator('#periodLabel')).toHaveText('September 2026');
    expect((await selected(page)).id).toBe('2026-09-30');
    const ownRow = () =>
      page.evaluate(() => {
        const a = window.__npa!,
          s = document.getElementById('scroller')!,
          row = a.calendarRows.blocks.find((b) => b.t === 'week' && b.key === a.S.calendarWeek)!;
        if (row.t !== 'week') throw new Error('Expected selected month row');
        return {
          own: row.mo.idx.includes(a.S.sel),
          visible: row.y >= s.scrollTop - 1 && row.y + row.base <= s.scrollTop + s.clientHeight + 1,
        };
      });
    expect(await ownRow()).toEqual({ own: true, visible: true });
    const beforeRight = await page.locator('#scroller').evaluate((el) => el.scrollTop);
    await page.locator('#cv').press('ArrowRight');
    await painted(page);
    expect(await page.locator('#scroller').evaluate((el) => el.scrollTop)).toBeCloseTo(
      beforeRight,
      0,
    );
    expect((await selected(page)).id).toBe('2026-10-01');
    expect(await ownRow()).toEqual({ own: true, visible: true });
    await choose(page, '2026-10-31');
    await page.locator('#cv').press('Enter');
    await page.locator('#cv').press('ArrowRight');
    expect((await selected(page)).id).toBe('2026-11-01');
    expect((await ownRow()).own).toBe(true);
    await sharedDetail(page);
  });
}

for (const width of [1512, 390]) {
  test(`Month arrows preserve scroll when the next real date is visible at ${width}px`, async ({
    page,
  }, info) => {
    await open(page, width);
    await choose(page, '2026-09-30');
    await page.locator('#cv').focus();
    const before = await page.evaluate(() => {
      const a = window.__npa!,
        s = document.getElementById('scroller')!,
        last = a.nights.findIndex((n) => n.id === '2026-09-30'),
        first = last + 1,
        prev = a.calendarRows.blocks.find(
          (b) => b.t === 'week' && b.mo.idx.includes(last) && b.wk.includes(last),
        )!,
        next = a.calendarRows.blocks.find(
          (b) => b.t === 'week' && b.mo.idx.includes(first) && b.wk.includes(first),
        )!;
      if (prev.t !== 'week' || next.t !== 'week') throw new Error('Expected both real month rows');
      s.scrollTop = prev.y - 16;
      return {
        top: s.scrollTop,
        nextVisible: next.y >= s.scrollTop && next.y + next.base <= s.scrollTop + s.clientHeight,
      };
    });
    expect(before.nextVisible).toBe(true);
    await painted(page);
    await page.locator('#cv').press('ArrowRight');
    await painted(page);
    expect((await selected(page)).id).toBe('2026-10-01');
    expect(await page.locator('#scroller').evaluate((el) => el.scrollTop)).toBeCloseTo(
      before.top,
      0,
    );
    const owner = await page.evaluate(() => {
      const a = window.__npa!;
      return a.calendarRows.blocks.find((b) => b.t === 'week' && b.key === a.S.calendarWeek)?.mo
        .key;
    });
    expect(owner).toBe('2026-10');
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-calendar-boundary-scroll-${width}.png`,
      });
    await page.locator('#cv').press('ArrowLeft');
    await painted(page);
    expect((await selected(page)).id).toBe('2026-09-30');
    expect(await page.locator('#scroller').evaluate((el) => el.scrollTop)).toBeCloseTo(
      before.top,
      0,
    );
  });
}

test('focus and thresholds retain the complete month and update the same shared night details', async ({
  page,
}) => {
  await open(page, 390);
  await choose(page, '2026-10-06');
  await page.locator('#cv').press('Enter');
  const before = await page.evaluate(() =>
    window.__npa!.calendarRows.blocks.map((b) => [b.y, b.h]),
  );
  await chooseFocus(page, 3);
  await chooseMoon(page, 'moonAltSel', '15');
  await chooseMoon(page, 'crescentSel', '0.3');
  expect(
    await page.evaluate(() => window.__npa!.calendarRows.blocks.map((b) => [b.y, b.h])),
  ).toEqual(before);
  await expect(page.locator('#calendarDetail')).toBeVisible();
  await expect(page.locator('#planSettingsBtn')).toBeVisible();
  await sharedDetail(page);
  await page.locator('#viewSeg button[data-view="river"]').click();
  await expect(page.locator('#calendarDetail')).toBeHidden();
  await expect(page.locator('#planSettingsBtn')).toBeVisible();
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
  await chooseMoon(page, 'moonAltSel', '15');
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

test('expanded Week links omit the retired month preference without saving private fields or recipient defaults', async ({
  page,
  browser,
}) => {
  await open(page, 390, 'windows');
  await choose(page, '2026-10-31');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.locator('#cv').press('Enter');
  await openShare(page);
  const link = await page.locator('#shareLink').inputValue(),
    hash = new URL(link).hash;
  expect(hash).toContain('calZoom=week');
  expect(hash).not.toContain('calMonthStyle');
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
    await painted(target);
    await fits(target);
    await expect(target.locator('#calendarDetail').getByRole('heading')).toHaveText(
      'Sat Oct 31 → Sun Nov 1',
    );
    await expect(target.locator('#calendarDetail .river-detail-note')).toContainText(
      'Clocks change',
    );
    const bounds = await target.locator('#calendarDetail').boundingBox(),
      frame = await target.locator('#cv').boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1);
    await target.getByRole('button', { name: 'Month', exact: true }).click();
    await expect(target.getByRole('combobox', { name: 'Month summary' })).toHaveCount(0);
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
    const visible = await point(page, '2026-10-09');
    await page.touchscreen.tap(visible.x, visible.y);
    await expect(page.locator('#calendarDetail')).toBeHidden();
    const target = await point(page, '2026-10-09');
    const event = {
      pointerType: 'touch',
      pointerId: 42,
      button: 0,
      clientX: target.x,
      clientY: target.y,
    };
    await page.locator('#cv').dispatchEvent('pointerdown', event);
    await page.locator('#cv').dispatchEvent('pointerup', { ...event, clientY: target.y + 30 });
    await expect(page.locator('#calendarDetail')).toBeHidden();
    await page.locator('#cv').dispatchEvent('pointerdown', event);
    await page.locator('#cv').dispatchEvent('pointercancel', event);
    await page.locator('#cv').dispatchEvent('pointerup', event);
    await expect(page.locator('#calendarDetail')).toBeHidden();
  } finally {
    await context.close();
  }
});

test('320px keeps readable month rows and scrolls to the selected night by keyboard', async ({
  page,
}) => {
  await open(page, 320);
  await page.setViewportSize({ width: 320, height: 740 });
  await choose(page, '2027-01-07');
  await fits(page);
  const rows = await page.evaluate(() =>
    window
      .__npa!.calendarRows.blocks.filter((b) => b.t === 'week' && b.mo.key === '2027-01')
      .map((b) => (b.t === 'week' ? b.base : 0)),
  );
  expect(rows).toHaveLength(6);
  expect(Math.min(...rows)).toBeGreaterThanOrEqual(78);
  await page.locator('#cv').press('ArrowDown');
  expect((await selected(page)).id).toBe('2027-01-14');
  await page.locator('#cv').press('Enter');
  await sharedDetail(page);
  await fits(page);
});

for (const width of [1512, 390]) {
  test(`Calendar periods and views reuse the loaded range after refresh at ${width}px`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.addEventListener('npa-ready', () => {
        const root = document.documentElement;
        root.dataset.computedRanges = String(Number(root.dataset.computedRanges ?? 0) + 1);
      });
    });
    await open(page, width);
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden();
    await choose(page, '2026-10-09');
    const nights = await page.evaluateHandle(() => window.__npa!.nights),
      range = await page.locator('#rangeLabel').textContent();
    for (const mode of ['Year', 'Month', 'Week', 'Year']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      await expect(page.locator('#loading')).toBeHidden();
      await painted(page);
      expect(await page.evaluate((loaded) => window.__npa!.nights === loaded, nights)).toBe(true);
      await expect(page.locator('#rangeLabel')).toHaveText(range!);
      expect((await selected(page)).id).toBe('2026-10-09');
    }
    for (const view of ['river', 'lunations', 'calendar']) {
      await page.locator(`#viewSeg button[data-view="${view}"]`).click();
      await expect(page.locator('#loading')).toBeHidden();
      expect(await page.evaluate((loaded) => window.__npa!.nights === loaded, nights)).toBe(true);
      await expect(page.locator('#rangeLabel')).toHaveText(range!);
    }
    await expect(page.locator('button[data-calendar-month]')).toHaveCount(14);
    await expect(page.locator('html')).toHaveAttribute('data-computed-ranges', '1');
    await nights.dispose();
  });
}

coldTest(
  'a Year chosen during loading publishes all loaded months with one ready event',
  async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
    await page.addInitScript(() => {
      localStorage.setItem(
        'npa:personal',
        JSON.stringify({
          version: 1,
          revision: 0,
          starterVersion: 1,
          sites: [],
          active: {
            site: {
              name: 'Seattle',
              lat: 47.74028262343255,
              lon: -122.31984159452988,
              tz: 'America/Los_Angeles',
              elevation: 122,
            },
          },
          preferences: { view: 'calendar' },
        }),
      );
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
    await expect(page.locator('button[data-calendar-month]')).toHaveCount(14);
    await expect(page.locator('html')).toHaveAttribute('data-calendar-ready-months', '14');
  },
);

test('a long observing-site name keeps the complete phone month inside the viewport', async ({
  page,
}) => {
  await seedPersonal(page, {
    site: {
      name: 'A very long observing-site name beside the reservoir and mountain trail',
      lat: 47.60621,
      lon: -122.34253,
      tz: 'America/Los_Angeles',
    },
  });
  await open(page, 390);
  await choose(page, '2027-01-01');
  await fits(page);
  await page.getByRole('combobox', { name: 'Observing site', exact: true }).focus();
  await expect(page.getByRole('combobox', { name: 'Observing site', exact: true })).toBeFocused();
});

test('a short tablet viewport keeps fourteen readable Year choices instead of squeezing the day grids', async ({
  page,
}) => {
  await open(page, 736, undefined, 'year');
  await page.setViewportSize({ width: 736, height: 740 });
  await painted(page);
  await fits(page);
  await expect(page.locator('#calendarHeaders')).toHaveClass('calendar-compact-year');
  await expect(page.locator('.calendar-year-phases:visible')).toHaveCount(14);
});

interface CalendarInk {
  text: Array<{ value: string; left: number; right: number; top: number; bottom: number }>;
  selected: number;
}
declare global {
  interface Window {
    calendarInk: CalendarInk;
  }
}

/** Capture actual browser text metrics, so intermediate widths get a real overlap check. */
async function captureCalendarInk(page: Page) {
  await page.addInitScript(() => {
    const context = CanvasRenderingContext2D.prototype,
      transform = context.setTransform,
      fill = context.fillText,
      stroke = context.strokeRect;
    const frame = () => window.calendarInk;
    context.setTransform = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
      if (this.canvas.id === 'cv')
        window.calendarInk = {
          text: [],
          selected: 0,
        };
      return Reflect.apply(transform, this, args);
    } as typeof transform;
    context.fillText = function (value, x, y, maxWidth) {
      if (this.canvas.id === 'cv' && frame()) {
        const m = this.measureText(value);
        frame().text.push({
          value,
          left: x - m.actualBoundingBoxLeft,
          right: x + m.actualBoundingBoxRight,
          top: y - m.actualBoundingBoxAscent,
          bottom: y + m.actualBoundingBoxDescent,
        });
      }
      if (maxWidth == null) fill.call(this, value, x, y);
      else fill.call(this, value, x, y, maxWidth);
    };
    context.strokeRect = function (...args) {
      if (
        this.canvas.id === 'cv' &&
        frame() &&
        this.lineWidth === 2 &&
        this.strokeStyle ===
          getComputedStyle(document.documentElement).getPropertyValue('--select').trim()
      )
        frame().selected++;
      stroke.apply(this, args);
    };
  });
}

for (const width of [1512, 390]) {
  test(`closed Calendar selection remains outlined across period changes at ${width}px @dark`, async ({
    page,
  }) => {
    await captureCalendarInk(page);
    await open(page, width);
    await choose(page, '2026-10-09');
    for (const name of ['Week', 'Month', 'Year', 'Month']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.locator('#loading')).toBeHidden();
      await painted(page);
      if (name === 'Year') continue;
      const marker = await page.evaluate(() => {
        const a = window.__npa!;
        return {
          row: a.calendarRows.blocks.some(
            (b) => b.t === 'week' && b.key === a.S.calendarWeek && b.wk.includes(a.S.sel),
          ),
          strokes: window.calendarInk.selected,
        };
      });
      expect(marker.row).toBe(true);
      expect(marker.strokes).toBeGreaterThan(0);
    }
  });
}

for (const width of [800, 1000]) {
  test(`Month duration and window text do not overlap at ${width}px`, async ({ page }, info) => {
    await captureCalendarInk(page);
    await open(page, width);
    await choose(page, '2026-10-09');
    const ink = await page.evaluate(() => {
      const a = window.__npa!,
        n = a.nights[a.S.sel],
        g = a.calendarRows.geometry,
        row = a.calendarRows.blocks.find((b) => b.t === 'week' && b.key === a.S.calendarWeek)!,
        st = document.getElementById('scroller')!.scrollTop;
      if (row.t !== 'week') throw new Error('Expected month row');
      const left = n.dow * g.cw,
        top = row.y - st,
        labels = window.calendarInk.text.filter(
          (t) =>
            t.left >= left && t.right <= left + g.cw && t.top >= top && t.bottom < top + row.base,
        );
      return {
        hours: labels.find((t) => /^\d+(?:\.\d+)?h(?: \d+m)?$/.test(t.value))!,
        windows: labels.filter((t) => /^\d{1,2}:\d{2}[ap]/.test(t.value)),
      };
    });
    expect(ink.hours).toBeTruthy();
    expect(ink.windows.length).toBeGreaterThan(0);
    for (const clock of ink.windows) expect(clock.top).toBeGreaterThanOrEqual(ink.hours.bottom + 1);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-calendar-month-${width}.png`,
      });
  });
}

test('compact Year keeps month text inside its cards on a short narrow phone', async ({
  page,
}, info) => {
  await open(page, 320, undefined, 'year');
  await page.setViewportSize({ width: 320, height: 740 });
  await painted(page);
  const overflow = await page.locator('button[data-calendar-month]').evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const b = node.getBoundingClientRect();
      return [...node.children].flatMap((child) => {
        const c = child.getBoundingClientRect();
        return c.width && c.height && (c.bottom > b.bottom + 0.5 || c.right > b.right + 0.5)
          ? [child.textContent]
          : [];
      });
    }),
  );
  expect(overflow).toEqual([]);
  await page.locator('[data-calendar-month="2027-10"]').focus();
  await painted(page);
  const target = await page.locator('[data-calendar-month="2027-10"]').boundingBox(),
    frame = await page.locator('#cv').boundingBox();
  expect(target!.y + target!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1);
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-calendar-year-short-phone.png`,
    });
  await page.locator('[data-calendar-month="2027-10"]').press('Enter');
  await expect(page.locator('#periodLabel')).toHaveText('October 2027');
  expect((await selected(page)).id).toBe('2027-10-01');
});

test('returning to Calendar selects the real date after a placeholder activation', async ({
  page,
}) => {
  await open(page, 390);
  await choose(page, '2026-10-01');
  const p = await point(page, '2026-09-30');
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#periodLabel')).toHaveText('October 2026');
  await page.locator('#viewSeg button[data-view="river"]').click();
  await page.locator('#viewSeg button[data-view="calendar"]').click();
  await painted(page);
  const own = await page.evaluate(() => {
    const a = window.__npa!,
      b = a.calendarRows.blocks.find((b) => b.t === 'week' && b.key === a.S.calendarWeek);
    return b?.t === 'week' && b.mo.idx.includes(a.S.sel);
  });
  expect((await selected(page)).id).toBe('2026-09-30');
  expect(own).toBe(true);
});

test('Calendar Year keeps the loaded range after selecting another year in River', async ({
  page,
}) => {
  await open(page, 1512, undefined, 'year');
  const nights = await page.evaluateHandle(() => window.__npa!.nights);
  await page.locator('#viewSeg button[data-view="river"]').click();
  await choose(page, '2027-01-01');
  await page.locator('#viewSeg button[data-view="calendar"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#periodLabel')).toHaveText('2026–2027');
  await expect(page.locator('button[data-calendar-month^="2027-"]')).toHaveCount(10);
  await expect(page.locator('[data-calendar-month="2027-01"]')).toHaveAttribute(
    'aria-current',
    'true',
  );
  expect(await page.evaluate((loaded) => window.__npa!.nights === loaded, nights)).toBe(true);
  expect((await selected(page)).id).toBe('2027-01-01');
  await nights.dispose();
});

test('short phone Week keeps the chart inside its viewport', async ({ page }, info) => {
  await open(page, 375, undefined, 'week');
  await page.setViewportSize({ width: 375, height: 667 });
  await painted(page);
  const bounds = await page.evaluate(() => {
    const cv = document.getElementById('cv')!.getBoundingClientRect(),
      readout = document.getElementById('riverReadout')!.getBoundingClientRect(),
      legend = document.getElementById('legendBtn')!.getBoundingClientRect(),
      heading = document.querySelector('.stage-head')!.getBoundingClientRect();
    return {
      bottom: cv.bottom,
      limit: readout.top,
      page: document.documentElement.scrollHeight,
      viewport: innerHeight,
      legendBottom: legend.bottom,
      headingBottom: heading.bottom,
    };
  });
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.limit + 1);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewport);
  expect(bounds.page).toBeLessThanOrEqual(bounds.viewport + 1);
  expect(bounds.legendBottom).toBeLessThanOrEqual(bounds.headingBottom);
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-calendar-week-short-phone.png`,
    });
});
