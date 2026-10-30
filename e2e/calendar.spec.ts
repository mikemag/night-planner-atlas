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
async function open(page: Page, width = 1512, orient = 'v', summer = false) {
  await page.setViewportSize({ width, height: width < 700 ? 844 : 920 });
  await page.clock.setFixedTime(new Date(summer ? '2026-06-15T03:00:00Z' : '2026-10-28T22:00:00Z'));
  await page.addInitScript(
    ({ orient, summer }) => {
      localStorage.setItem('npa:view', '"calendar"');
      localStorage.setItem('npa:calOrient', JSON.stringify(orient));
      if (summer)
        localStorage.setItem(
          'npa:site',
          JSON.stringify({ name: 'Edinburgh', lat: 55.95, lon: -3.19, tz: 'Europe/London' }),
        );
    },
    { orient, summer },
  );
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await painted(page);
}
async function choose(page: Page, id: string) {
  await page.evaluate((id) => {
    const a = window.__npa!;
    a.select(
      a.nights.findIndex((n) => n.id === id),
      true,
      true,
    );
  }, id);
  await painted(page);
}
async function monthTop(page: Page, key: string) {
  await page.evaluate((key) => {
    const a = window.__npa!,
      b = a.calendarRows.blocks.find((b) => b.t === 'head' && b.mo.key === key)!;
    document.getElementById('scroller')!.scrollTop = b.y;
    a.draw();
  }, key);
  await painted(page);
}
async function point(page: Page, id: string, key?: string) {
  await page.locator('#cv').scrollIntoViewIfNeeded();
  return page.evaluate(
    ({ id, key }) => {
      const a = window.__npa!,
        i = a.nights.findIndex((n) => n.id === id),
        r = a.calendarRows;
      const b = r.blocks.find(
        (b) =>
          b.t === 'week' && (key ? b.key === key : b.key === a.S.calendarWeek) && b.wk.includes(i),
      )!;
      if (b.t !== 'week') throw new Error('Missing week');
      const rect = document.getElementById('cv')!.getBoundingClientRect(),
        st = document.getElementById('scroller')!.scrollTop;
      return {
        x: rect.x + r.geometry.x0 + (b.wk.indexOf(i) + 0.5) * r.geometry.cw,
        y: rect.y + r.axis + b.y - st + 40,
      };
    },
    { id, key },
  );
}
async function selected(page: Page) {
  return page.evaluate(() => {
    const a = window.__npa!;
    return a.nights[a.S.sel];
  });
}

for (const width of [1512, 390])
  for (const orient of ['v', 'h']) {
    test(`Calendar keeps a readable month grid and shares night details at ${width}px, ${orient}`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await open(page, width, orient);
      await expect(page.locator('#inspector')).toHaveCount(0);
      await expect(page.locator('#focusSeg button[data-val="0"]')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await monthTop(page, '2026-10');
      const heading = page.locator('.calendar-heading[data-month="2026-10"]');
      await expect(heading.getByRole('heading')).toHaveText('October 2026');
      await expect(heading.getByRole('img')).toHaveAccessibleName(/Scale 0 to 12 hours/);
      const fits = await heading.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [...el.querySelectorAll('h2,summary,.calendar-profile')].every((n) => {
          const b = n.getBoundingClientRect();
          return (
            b.left >= r.left - 1 &&
            b.right <= r.right + 1 &&
            b.top >= r.top - 1 &&
            b.bottom <= r.bottom + 1
          );
        });
      });
      expect(fits).toBe(true);
      if (width === 1512) {
        await heading.locator('summary').click();
        const explanation = heading.locator('details > p');
        const readable = await explanation.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 4));
        });
        expect(readable).toBe(true);
        await page.keyboard.press('Escape');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-calendar-${orient}-${width}.png`,
          fullPage: width === 390,
        });
      await choose(page, '2026-10-09');
      const p = await point(page, '2026-10-09');
      await page.mouse.click(p.x, p.y);
      const detail = page.locator('#calendarDetail');
      await expect(detail).toBeVisible();
      const n = await selected(page);
      await expect(detail.getByRole('heading')).toHaveText(nightTitle(n));
      expect(await detail.boundingBox().then((b) => b!.width)).toBeGreaterThan(width - 45);
      expect(await detail.locator('.river-window').count()).toBe(n.mf.length);
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
        await expect(detail).toContainText(fmtClock(n.evH[key]));
      await expect(detail).toContainText(fmtDur(n.mfMs));
      const contrast = await detail
        .locator('.river-window-duration')
        .first()
        .evaluate((el) => {
          const luminance = (color: string) => {
            const c = color
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number)
              .map((v) => v / 255)
              .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
            return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
          };
          const a = luminance(getComputedStyle(el).fill),
            b = luminance(getComputedStyle(el.closest('svg')!).backgroundColor);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      await expect(page.locator('#riverReadout')).toContainText('usable dark');
      await expect(page.locator('#tip')).toBeHidden();
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-calendar-${orient}-expanded-${width}.png`,
          fullPage: width === 390,
        });
      await page.locator('#cv').press('ArrowRight');
      await expect(detail.getByRole('heading')).toHaveText('Sat Oct 10 → Sun Oct 11');
      await page.locator('#cv').press('Escape');
      await expect(detail).toBeHidden();
      await page.locator('#cv').press('Enter');
      await expect(detail).toBeVisible();
      await detail.getByRole('button', { name: 'Collapse night' }).click();
      await expect(detail).toBeHidden();
      expect(errors).toEqual([]);
    });
  }

test('neighboring dates keep the activated week and never enter its named-month total; unloaded dates cannot select', async ({
  page,
}) => {
  await open(page, 390);
  await monthTop(page, '2026-10');
  const heading = page.locator('.calendar-heading[data-month="2026-10"]');
  const total = await heading.locator('strong').textContent();
  const p = await point(page, '2026-09-30', '2026-10:0');
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#calendarDetail').getByRole('heading')).toHaveText(
    'Wed Sep 30 → Thu Oct 1',
  );
  expect(await page.evaluate(() => window.__npa!.S.calendarWeek)).toBe('2026-10:0');
  await expect(heading.locator('strong')).toHaveText(total!);
  await page.locator('#cv').press('ArrowRight');
  await expect(page.locator('#calendarDetail').getByRole('heading')).toHaveText(
    'Thu Oct 1 → Fri Oct 2',
  );
  expect(await page.evaluate(() => window.__npa!.S.calendarWeek)).toBe('2026-10:0');
  await page.locator('#cv').press('Escape');
  await monthTop(page, '2026-09');
  const previous = (await selected(page)).id;
  const unavailable = await page.evaluate(() => {
    const a = window.__npa!,
      r = a.calendarRows,
      b = r.blocks.find((b) => b.t === 'week' && b.key === '2026-09:0')!;
    const c = document.getElementById('cv')!.getBoundingClientRect(),
      st = document.getElementById('scroller')!.scrollTop;
    return { x: c.x + r.geometry.x0 + r.geometry.cw / 2, y: c.y + r.axis + b.y - st + 40 };
  });
  await page.mouse.click(unavailable.x, unavailable.y);
  expect((await selected(page)).id).toBe(previous);
  await expect(page.locator('#calendarDetail')).toBeHidden();
});

test('monthly totals and duration scales follow thresholds while focus preserves weeks and the selected detail', async ({
  page,
}) => {
  await open(page, 390);
  await choose(page, '2026-10-06');
  await page.locator('#cv').press('Enter');
  const before = await page.evaluate(() =>
    window.__npa!.calendarRows.blocks.map((b) => [b.mo.key, b.y, b.h]),
  );
  const heading = page.locator('.calendar-heading[data-month="2026-10"]');
  const total = await heading.locator('strong').textContent();
  await page.locator('#focusSeg button[data-val="3"]').click();
  expect(
    await page.evaluate(() => window.__npa!.calendarRows.blocks.map((b) => [b.mo.key, b.y, b.h])),
  ).toEqual(before);
  await expect(heading.locator('strong')).toHaveText(total!);
  await expect(page.locator('#calendarDetail')).toBeVisible();
  await page.locator('#moonAltSel').selectOption('15');
  await page.locator('#crescentSel').selectOption('0.3');
  const expected = await page.evaluate(() =>
    window.__npa!.nights.filter((n) => n.y === 2026 && n.m === 10).reduce((s, n) => s + n.mfMs, 0),
  );
  await expect(heading.locator('strong')).toHaveText(`${fmtDur(expected)} usable`);
  expect(await heading.locator('strong').textContent()).not.toBe(total);
  await monthTop(page, '2026-10');
  await heading.locator('summary').click();
  await expect(heading.locator('details > p')).toContainText('31 evening dates in October 2026');
  await expect(heading.locator('details > p')).toContainText('Neighboring-month dates');
  await page.keyboard.press('Escape');
  await expect(heading.locator('details')).not.toHaveAttribute('open');
  await page.locator('#viewSeg button[data-view="river"]').click();
  await expect(page.locator('#calendarHeaders')).toBeHidden();
  await expect(page.locator('#calendarDetail')).toBeHidden();
});

test('Year summaries are keyboard month choosers and a single night click drills into its exact date', async ({
  page,
}, info) => {
  await open(page, 390, 'h');
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  const month = page.locator('button[data-calendar-month="2026-12"]');
  await expect(month).toHaveAccessibleName(/December 2026.*usable dark.*Open month/);
  await month.focus();
  await month.press('Enter');
  expect((await selected(page)).id).toBe('2026-12-01');
  await expect(page.getByRole('button', { name: 'Time →', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await painted(page);
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-calendar-year-390.png`,
      fullPage: true,
    });
  const target = await page.evaluate(() => {
    const a = window.__npa!,
      b = a.calendarRows.blocks.find((b) => b.t === 'mini' && b.mo.key === '2026-12')!;
    if (b.t !== 'mini') throw new Error('Missing month');
    const i = a.nights.findIndex((n) => n.id === '2026-12-31'),
      wi = b.mo.weeks.findIndex((w) => w.includes(i)),
      d = b.mo.weeks[wi].indexOf(i);
    document.getElementById('scroller')!.scrollTop = b.y;
    const c = document.getElementById('cv')!.getBoundingClientRect(),
      cw = b.w / 7,
      ch = Math.min(34, cw * 1.35);
    return { x: c.x + b.x + (d + 0.5) * cw, y: c.y + 88 + 20 + (wi + 0.5) * ch };
  });
  await painted(page);
  await page.mouse.click(target.x, target.y);
  expect((await selected(page)).id).toBe('2026-12-31');
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('#cv').press('Enter');
  await expect(page.locator('#calendarDetail').getByRole('heading')).toHaveText(
    'Thu Dec 31 → Fri Jan 1',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('resizing preserves a browsed week and selection, and both orientations retain an open night', async ({
  page,
}) => {
  await open(page);
  await choose(page, '2026-10-09');
  await page.locator('#cv').press('Enter');
  await page.getByRole('button', { name: 'Time →', exact: true }).click();
  await expect(page.locator('#calendarDetail').getByRole('heading')).toHaveText(
    'Fri Oct 9 → Sat Oct 10',
  );
  await page.getByRole('button', { name: 'Time ↓', exact: true }).click();
  await page.evaluate(() => {
    const a = window.__npa!,
      b = a.calendarRows.blocks.find((b) => b.t === 'week' && b.key === '2027-04:2')!;
    document.getElementById('scroller')!.scrollTop = b.y + 32;
  });
  await painted(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await painted(page);
  const after = await page.evaluate(() => {
    const a = window.__npa!,
      st = document.getElementById('scroller')!.scrollTop,
      b = a.calendarRows.blocks.find((b) => b.y + b.h > st)!;
    return {
      key: b.t === 'week' ? b.key : '',
      offset: st - b.y,
      sel: a.nights[a.S.sel].id,
      open: a.S.calendarExpanded,
    };
  });
  expect(after).toEqual({ key: '2027-04:2', offset: 32, sel: '2026-10-09', open: true });
  await page.locator('#todayBtn').click();
  await expect(page.locator('#calendarDetail')).toBeVisible();
});

test('shared Calendar night facts handle no-dark, split windows and clock changes', async ({
  page,
}) => {
  await open(page, 390, 'v', true);
  await choose(page, '2026-06-20');
  await page.locator('#cv').press('Enter');
  await expect(page.locator('#calendarDetail')).toContainText('No astronomical darkness');
  await expect(page.locator('#riverReadout')).toContainText('No true dark');
  await page.locator('#moonAltSel').selectOption('15');
  await page.evaluate(() => {
    const a = window.__npa!,
      i = a.nights.findIndex((n) => n.mf.length > 1);
    if (i < 0) throw new Error('Expected split night');
    a.select(i, true, true);
  });
  const n = await selected(page);
  expect(n.mf.length).toBeGreaterThan(1);
  for (const t of n.mfH.flat().map(fmtClock))
    await expect(page.locator('#calendarDetail')).toContainText(t);
  expect(await page.locator('#calendarDetail .river-window').count()).toBe(n.mf.length);
  await page.evaluate(() => {
    const a = window.__npa!,
      i = a.nights.findIndex((n) => n.dst && n.mfMs > 0);
    a.select(i, true, true);
  });
  await expect(page.locator('#calendarDetail .river-detail-note')).toContainText('Clocks change');
});

test('an expanded Calendar share link restores its night and orientation without saving private fields', async ({
  page,
  browser,
}) => {
  await open(page, 390, 'h');
  await choose(page, '2026-10-31');
  await page.locator('#cv').press('Enter');
  await page.locator('#shareBtn').click();
  const link = await page.locator('#shareLink').inputValue(),
    hash = new URL(link).hash;
  expect(hash).toContain('view=calendar');
  expect(hash).toContain('expanded=1');
  expect(hash).toContain('calOrient=h');
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
    await expect(target.getByRole('button', { name: 'Time →', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await target.evaluate(() => localStorage.getItem('npa:calOrient'))).toBeNull();
  } finally {
    await context.close();
  }
});

test('phone taps toggle a night while scrolling and canceled touch gestures cannot expand one', async ({
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
    let p = await point(page, '2026-10-09');
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator('#calendarDetail')).toBeVisible();
    p = await point(page, '2026-10-09');
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator('#calendarDetail')).toBeHidden();
    const event = { pointerType: 'touch', pointerId: 42, button: 0, clientX: p.x, clientY: p.y };
    await page.locator('#cv').dispatchEvent('pointerdown', event);
    await page.locator('#scroller').evaluate((el) => {
      el.scrollTop += 64;
    });
    await page.locator('#cv').dispatchEvent('pointerup', event);
    await expect(page.locator('#calendarDetail')).toBeHidden();
    await page.locator('#cv').dispatchEvent('pointerdown', event);
    await page.locator('#cv').dispatchEvent('pointercancel', event);
    await page.locator('#cv').dispatchEvent('pointerup', event);
    await expect(page.locator('#calendarDetail')).toBeHidden();
    await expect(page.locator('#tip')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  } finally {
    await context.close();
  }
});
