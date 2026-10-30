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

async function open(page: Page, width = 1512, focus: number | null = null, site = false) {
  await page.setViewportSize({ width, height: width < 700 ? 844 : 920 });
  await page.clock.setFixedTime(new Date('2026-06-15T03:00:00Z'));
  await page.addInitScript(
    ({ focus, site }) => {
      localStorage.setItem('npa:view', JSON.stringify('lunations'));
      if (focus !== null) localStorage.setItem('npa:focus', JSON.stringify(focus));
      if (site)
        localStorage.setItem(
          'npa:site',
          JSON.stringify({ name: 'Edinburgh', lat: 55.95, lon: -3.19, tz: 'Europe/London' }),
        );
    },
    { focus, site },
  );
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    const a = window.__npa!;
    const L = a.lunationRows.cycles.find((L) => a.nights[L.i]?.m === 6)!;
    a.select(L.i, true, true);
  });
  await painted(page);
}

async function selected(page: Page) {
  return page.evaluate(() => {
    const a = window.__npa!;
    const rows = a.lunationRows;
    const k = rows.cycles.findIndex((L) => a.S.sel >= L.first && a.S.sel <= L.last);
    const L = rows.cycles[k];
    const first = Math.max(0, L.first, L.i - rows.geometry.N);
    const last = Math.min(a.nights.length - 1, L.last, L.i + rows.geometry.N);
    return {
      n: a.nights[a.S.sel],
      k,
      cycle: rows.cycles[k],
      geometry: rows.geometry,
      top: rows.tops[k],
      count: last - first + 1,
    };
  });
}

test('Full cycle covers every night once, restores formerly missing dates, and ignores padding', async ({
  page,
}) => {
  await open(page);
  await expect(page.locator('#focusSeg button[data-val="0"]')).toHaveText('Full cycle');
  const count = await page.evaluate(() => window.__npa!.nights.length);
  const displayed = await page.locator('.lunation-heading').evaluateAll((headers) =>
    headers.flatMap((header) => {
      const first = Number((header as HTMLElement).dataset.first);
      const last = Number((header as HTMLElement).dataset.last);
      return Array.from({ length: last - first + 1 }, (_, k) => first + k);
    }),
  );
  expect(displayed).toEqual(Array.from({ length: count }, (_, i) => i));
  const missing = await page.evaluate(() => {
    const a = window.__npa!;
    const rows = a.lunationRows;
    const L = rows.cycles.find(
      (L, k) => L.i >= 0 && L.i + 15 < a.nights.length && rows.cycles[k + 1]?.i - L.i === 30,
    )!;
    const i = L.i + 15;
    const owner = rows.cycles.find((L) => i >= L.first && i <= L.last)!;
    a.select(owner.i, true, true);
    return {
      i,
      center: owner.i,
      column: i - owner.i + rows.geometry.N,
      pad: owner.first > owner.i - rows.geometry.N ? 0 : rows.geometry.cols - 1,
    };
  });
  await painted(page);
  const point = async (column: number) => {
    const box = (await page.locator('#cv').boundingBox())!;
    const g = (await selected(page)).geometry;
    return { x: box.x + g.x0 + (column + 0.5) * g.cw, y: box.y + 32 + g.header + 28 + 120 };
  };
  const target = await point(missing.column);
  await page.mouse.click(target.x, target.y);
  await expect(page.locator('#lunationsDetail')).toBeVisible();
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(missing.i);
  const n = await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel]);
  await expect(page.locator('#lunationsDetail').getByRole('heading')).toHaveText(nightTitle(n));
  await page.locator('#cv').press('Escape');
  await page.locator('#cv').press('ArrowRight');
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(missing.i + 1);
  await page.locator('#cv').press('ArrowLeft');
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(missing.i);
  await page.evaluate((i) => window.__npa!.select(i, true, true), missing.center);
  await painted(page);
  const padding = await point(missing.pad);
  await page.mouse.click(padding.x, padding.y);
  await expect(page.locator('#lunationsDetail')).toBeHidden();
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(missing.center);

  // An explicit Full cycle link keeps the whole cycle even on a fresh phone presentation.
  await page.locator('#shareBtn').click();
  const link = await page.locator('#shareLink').inputValue();
  await page.locator('#shareCancel').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(link);
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#focusSeg button[data-val="0"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await selected(page)).geometry.N).toBe(15);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await page.evaluate(() => localStorage.getItem('npa:focus'))).toBeNull();
});

for (const width of [1512, 390]) {
  test(`Lunations shows readable cycles and an ordered inline night at ${width}px`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, width);
    const before = await selected(page);
    expect(before.geometry.N).toBe(width < 700 ? 3 : 15);
    expect(before.geometry.cw).toBeGreaterThanOrEqual(40);
    await expect(page.locator('#inspector')).toBeHidden();
    await expect(page.locator('#lunationsDetail')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await page.locator('#scroller').evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(
      0,
    );
    const box = (await page.locator('#cv').boundingBox())!;
    const x = box.x + before.geometry.x0 + (before.geometry.N + 0.5) * before.geometry.cw;
    const y = box.y + 32 + before.geometry.header + 28 + 120;
    await page.mouse.move(x, y);
    await expect(page.locator('#tip')).toBeHidden();
    await expect(page.locator('#riverReadout')).toContainText(fmtDur(before.n.mfMs));
    await page.mouse.click(x, y);
    const detail = page.locator('#lunationsDetail');
    await expect(detail).toBeVisible();
    await expect(page.locator('#cv')).toHaveAttribute('aria-expanded', 'true');
    await expect(detail.getByRole('heading')).toHaveText(nightTitle(before.n));
    await expect(detail.locator('svg')).toHaveAttribute(
      'aria-label',
      new RegExp(`${fmtDur(before.n.mfMs)} usable dark`),
    );
    for (const time of [
      before.n.evH.sunset,
      before.n.evH.sunrise,
      before.n.evH.astroDusk,
      before.n.evH.astroDawn,
    ].map(fmtClock))
      await expect(detail).toContainText(time);
    await painted(page);
    const callouts = await detail.locator('.river-event').evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }),
    );
    const bounds = (await detail.boundingBox())!;
    for (let i = 0; i < callouts.length; i++) {
      const a = callouts[i];
      expect(a.x).toBeGreaterThanOrEqual(bounds.x);
      expect(a.right).toBeLessThanOrEqual(bounds.x + bounds.width);
      for (const b of callouts.slice(i + 1))
        expect(
          a.right + 5 <= b.x || b.right + 5 <= a.x || a.bottom + 1 <= b.y || b.bottom + 1 <= a.y,
        ).toBe(true);
    }
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-lunations-expanded-${width}.png`,
        fullPage: width < 700,
      });
    const height = bounds.height;
    await page.locator('#cv').press('ArrowRight');
    const next = await selected(page);
    expect(next.n.id).not.toBe(before.n.id);
    await expect(detail.getByRole('heading')).toHaveText(nightTitle(next.n));
    expect((await detail.boundingBox())!.height).toBe(height);
    await page.locator('#cv').press('ArrowDown');
    const cycle = await selected(page);
    expect(cycle.n.id).not.toBe(next.n.id);
    expect(cycle.n.nmOff).toBe(next.n.nmOff);
    await expect(detail.getByRole('heading')).toHaveText(nightTitle(cycle.n));
    await page.locator('#cv').press('Escape');
    await expect(detail).toBeHidden();
    expect((await selected(page)).n.id).toBe(cycle.n.id);
    await page.locator('#cv').press(' ');
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Collapse night' }).click();
    await expect(detail).toBeHidden();
    expect(errors).toEqual([]);
    await page.evaluate(() => {
      const a = window.__npa!;
      const L = a.lunationRows.cycles.find((L) => a.nights[L.i]?.m === 6)!;
      a.select(L.i, true, true);
    });
    await painted(page);
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-lunations-overview-${width}.png`,
        fullPage: width < 700,
      });
  });
}

test('phone defaults stay local to Lunations, survive sharing, and preserve the browsed cycle on resize', async ({
  page,
}) => {
  await open(page, 390);
  await expect(page.locator('#focusSeg button[data-val="3"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => localStorage.getItem('npa:focus'))).toBeNull();
  const initial = await selected(page);
  const browsed = await page.evaluate(() => {
    const a = window.__npa!;
    const rows = a.lunationRows;
    const k = rows.cycles.findIndex((L) => a.nights[L.i]?.m === 8);
    document.getElementById('scroller')!.scrollTop = rows.tops[k] + rows.heights[k] / 4;
    return rows.cycles[k].t;
  });
  await page.setViewportSize({ width: 1512, height: 920 });
  await painted(page);
  expect((await selected(page)).geometry.N).toBe(15);
  expect((await selected(page)).n.id).toBe(initial.n.id);
  const anchor = await page.evaluate(() => {
    const rows = window.__npa!.lunationRows;
    const st = document.getElementById('scroller')!.scrollTop;
    const k = rows.tops.findIndex((y, k) => y <= st && y + rows.heights[k] > st);
    return { t: rows.cycles[k].t, fraction: (st - rows.tops[k]) / rows.heights[k] };
  });
  expect(anchor.t).toBe(browsed);
  expect(anchor.fraction).toBeCloseTo(0.25, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await painted(page);
  expect((await selected(page)).geometry.N).toBe(3);
  await page.locator('#viewSeg').getByRole('button', { name: 'River', exact: true }).click();
  await expect(page.locator('#focusSeg button[data-val="0"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('#viewSeg').getByRole('button', { name: 'Lunations', exact: true }).click();
  await page.locator('#cv').press('Enter');
  await page.locator('#shareBtn').click();
  const link = await page.locator('#shareLink').inputValue();
  expect(new URLSearchParams(new URL(link).hash.slice(1)).get('focus')).toBe('3');
  expect(new URLSearchParams(new URL(link).hash.slice(1)).get('expanded')).toBe('1');
  await page.locator('#shareCancel').click();
  await page.setViewportSize({ width: 1512, height: 920 });
  await page.goto(link);
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#focusSeg button[data-val="3"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#lunationsDetail')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('npa:focus'))).toBeNull();
});

test('resizing retains an open night even outside the automatic phone window', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const a = window.__npa!;
    a.select(a.S.sel + 10, true, true);
  });
  await page.locator('#cv').press('Enter');
  const night = await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id);
  await page.setViewportSize({ width: 390, height: 844 });
  await painted(page);
  expect(await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel].id)).toBe(night);
  await expect(page.locator('#lunationsDetail')).toBeVisible();
  await expect(page.locator('#lunationsDetail')).toContainText('Night outside displayed window');
  await expect(page.locator('#focusSeg button[data-val="3"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('expansion preserves a partially scrolled cycle and hidden totals cannot intercept another view', async ({
  page,
}) => {
  await open(page);
  await page.setViewportSize({ width: 1512, height: 1400 });
  await painted(page);
  const value = await selected(page);
  const chart = page.locator('#scroller');
  await chart.evaluate((el, top) => {
    el.scrollTop = top + 100;
  }, value.top);
  const before = await chart.evaluate((el) => el.scrollTop);
  await page.locator('#cv').press('Enter');
  await expect(page.locator('#lunationsDetail')).toBeVisible();
  expect(await chart.evaluate((el) => el.scrollTop)).toBeCloseTo(before, 0);
  await page.locator('#cv').press('Escape');
  await page.evaluate(() => {
    const a = window.__npa!;
    a.select(a.S.sel, true, true);
  });
  await page.locator(`.lunation-heading[data-cycle="${value.k}"] summary`).click();
  await page.locator('#viewSeg').getByRole('button', { name: 'River', exact: true }).click();
  await page.locator('#cv').press('Enter');
  await expect(page.locator('#riverDetail')).toBeVisible();
  await page.locator('#cv').press('Escape');
  await expect(page.locator('#riverDetail')).toBeHidden();
});

test('wider phone windows pan within the chart, keep headers and detail fixed, and do not activate during pans', async ({
  page,
}) => {
  await open(page, 390, 0);
  const before = await selected(page);
  expect(before.geometry.N).toBe(15);
  const chart = page.locator('#scroller');
  expect(await chart.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(700);
  const header = page.locator(`.lunation-heading[data-cycle="${before.k}"]`);
  const initialBounds = (await header.boundingBox())!;
  const cv = page.locator('#cv');
  const b = (await cv.boundingBox())!;
  await cv.dispatchEvent('pointerdown', {
    button: 0,
    pointerId: 9,
    pointerType: 'touch',
    clientX: b.x + 150,
    clientY: b.y + 160,
  });
  await chart.evaluate((el) => {
    el.scrollLeft += 90;
  });
  await cv.dispatchEvent('pointerup', {
    button: 0,
    pointerId: 9,
    pointerType: 'touch',
    clientX: b.x + 150,
    clientY: b.y + 160,
  });
  await painted(page);
  await expect(page.locator('#lunationsDetail')).toBeHidden();
  expect((await header.boundingBox())!.x).toBeCloseTo(initialBounds.x, 0);
  expect((await cv.boundingBox())!.x).toBeCloseTo(b.x, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await cv.press('Enter');
  await expect(page.locator('#lunationsDetail')).toBeVisible();
  await chart.evaluate((el) => {
    el.scrollLeft -= 180;
  });
  await painted(page);
  const detail = (await page.locator('#lunationsDetail').boundingBox())!;
  expect(detail.x).toBeCloseTo(b.x, 0);
  expect(detail.width).toBeCloseTo(b.width, 0);
  await page.locator('#viewSeg').getByRole('button', { name: 'River', exact: true }).click();
  expect(await chart.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await chart.evaluate((el) => el.scrollLeft)).toBe(0);
});

test('cycle totals explain the displayed dates and refresh with the window and thresholds', async ({
  page,
}) => {
  await open(page);
  for (const focus of [3, 0, 7]) {
    await page.locator(`#focusSeg button[data-val="${focus}"]`).click();
    await painted(page);
    const value = await selected(page);
    const sum = await page.evaluate(() => {
      const a = window.__npa!;
      const g = a.lunationRows.geometry;
      const L = a.lunationRows.cycles.find((L) => a.S.sel >= L.first && a.S.sel <= L.last)!;
      return a.nights
        .slice(Math.max(0, L.first, L.i - g.N), Math.min(L.last, L.i + g.N) + 1)
        .reduce((sum, n) => sum + n.mfMs, 0);
    });
    const total = page.locator(`.lunation-heading[data-cycle="${value.k}"] .lunation-total`);
    await expect(total.locator('strong')).toHaveText(fmtDur(sum));
    await total.locator('summary').click();
    await expect(total.locator('p')).toBeVisible();
    await expect(total.locator('p')).toContainText(`${value.count} displayed evening dates`);
    await total.locator('summary').press('Escape');
    await expect(total).not.toHaveAttribute('open', '');
  }
  await page.locator('#moonAltSel').selectOption('15');
  await page.locator('#crescentSel').selectOption('0.3');
  await painted(page);
  const value = await selected(page);
  await expect(page.locator(`.lunation-heading[data-cycle="${value.k}"] strong`)).toHaveText(
    fmtDur(value.cycle.total),
  );
  const pick = page.locator(`.lunation-heading[data-cycle="${value.k}"] button[data-weekend]`);
  await pick.click();
  await expect(page.locator('#lunationsDetail')).toBeVisible();
  const n = await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel]);
  expect(n.dow).toBe(5);
  await expect(page.locator('#lunationsDetail')).toContainText(nightTitle(n));
  const partial = page
    .locator('.lunation-heading')
    .filter({ has: page.locator('.lunation-name p', { hasText: 'Partial' }) })
    .last();
  await page.locator('#focusSeg button[data-val="0"]').click();
  await expect(partial).toContainText('Partial');
  await partial.locator('summary').click();
  await expect(partial.locator('.lunation-total p')).toContainText(/of (29|30) nights are loaded/);
});

test('no-dark and split-window nights retain useful inline explanations', async ({ page }) => {
  await open(page, 390, null, true);
  await page.locator('#cv').press('Enter');
  await expect(page.locator('#lunationsDetail')).toContainText('No astronomical darkness');
  await expect(page.locator('#riverReadout')).toContainText('No true dark');
  await page.locator('#moonAltSel').selectOption('15');
  await page.evaluate(() => {
    const a = window.__npa!;
    const i = a.nights.findIndex((n) => n.mf.length > 1);
    if (i < 0) throw new Error('Expected a split-window night in this fixed range');
    a.select(i, true);
  });
  const n = await page.evaluate(() => window.__npa!.nights[window.__npa!.S.sel]);
  expect(n.mf.length).toBeGreaterThan(1);
  for (const time of n.mfH.flat().map(fmtClock))
    await expect(page.locator('#lunationsDetail')).toContainText(time);
});
