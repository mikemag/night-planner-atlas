import { chooseTheme, openGuide } from './header-controls';
import { expect, test } from '@playwright/test';

for (const width of [1512, 390]) {
  test(`Docs navigation, examples and offline reference work at ${width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.clock.setFixedTime(new Date('2026-10-28T22:00:00Z'));
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?docs=overview');
    await expect(page.getByRole('heading', { name: 'Find good nights' })).toBeVisible();
    expect(await page.evaluate(() => window.__npa!.nights.length)).toBe(0);
    await expect(page.locator('#siteSel')).toBeHidden();
    await expect(page.locator('#viewSeg')).toBeHidden();
    await expect(page.locator('#planningControls')).toBeHidden();
    for (const theme of ['light', 'dark', 'observing']) {
      await chooseTheme(page, theme);
      const ramps = await page.locator('.guide-sky-ramp').evaluateAll((ramps) => {
        const luminance = (color: string) => {
          const [r, g, b] = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const c = v / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        return ramps.map((ramp) =>
          [...ramp.children].map((node) => {
            const css = getComputedStyle(node),
              a = luminance(css.color),
              b = luminance(css.backgroundColor);
            return { contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), lightness: b };
          }),
        );
      });
      for (const ramp of ramps) {
        expect(ramp.every((s) => s.contrast >= 4.5)).toBe(true);
        expect(ramp.every((s, i) => i === 0 || ramp[i - 1].lightness > s.lightness)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-docs-overview-${theme}-${width}.png`,
        });
    }
    await page.getByRole('link', { name: 'Read the FAQ →', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();
    if (process.env.SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screenshots/${info.project.name}-docs-faq-${width}.png`,
      });
    await page
      .getByRole('link', { name: 'Compare the same night under different settings.', exact: true })
      .click();
    await expect(page.locator('#examples')).toBeInViewport();
    await expect(page.locator('#docsBack')).toBeInViewport();
    await expect(page.locator('[data-night-example="simple"]')).toContainText('7h 38m usable');
    await expect(page.locator('[data-night-example="moon"]')).toContainText('4h 30m usable');
    const saved = await page.evaluate(() => localStorage.getItem('npa:personal'));
    for (const [setting, total] of [
      ['height', '5h 10m'],
      ['crescent', '7h 17m'],
      ['strict', '4h 30m'],
    ]) {
      await page.locator(`[data-example-setting="${setting}"]`).click();
      await expect(page.locator('[data-night-example="moon"]')).toContainText(total);
      const link = new URL(
        (await page.locator('[data-example-link="moon"]').getAttribute('href'))!,
      );
      expect(link.search).toBe('');
      expect(link.hash).toContain('night=2026-09-06');
      expect(link.hash).toContain('name=Seattle');
    }
    expect(await page.evaluate(() => localStorage.getItem('npa:personal'))).toBe(saved);
    for (const theme of ['light', 'dark']) {
      await chooseTheme(page, theme);
      if (process.env.SCREENSHOTS) {
        await page.locator('#moon-example').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-docs-example-${theme}-${width}.png`,
        });
      }
    }
    await context.setOffline(true);
    await page
      .getByRole('link', {
        name: 'See how Atlas calculates usable windows.',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'The Moon and usable windows' }),
    ).toBeInViewport();
    await page
      .getByText('Why rise/set events and altitude curves use different points', { exact: true })
      .click();
    await expect(
      page.getByRole('img', { name: 'The Moon’s upper edge and center are different' }),
    ).toBeVisible();
    if (width === 390) await page.locator('#docsContents > summary').click();
    await page.getByRole('link', { name: 'Accuracy', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Accuracy and limits' })).toBeInViewport();
    await page
      .getByText('Search windows, numerical tolerances and reference provenance', { exact: true })
      .click();
    await expect(page.locator('#referenceQueries a')).toHaveCount(15);
    await expect(page.locator('#referenceFixture')).toHaveAttribute('href', /^blob:/);
    if (width === 390) await page.locator('#docsContents > summary').click();
    await page.getByRole('link', { name: 'Licenses and credits', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Licenses and credits', exact: true }),
    ).toBeVisible();
    for (const [summary, id, text] of [
      [
        'Read the full AGPL-3.0 license offline',
        'codeLicenseText',
        'GNU AFFERO GENERAL PUBLIC LICENSE',
      ],
      [
        'Read the full CC BY-SA 4.0 license offline',
        'contentLicenseText',
        'Attribution-ShareAlike 4.0 International',
      ],
      ['Read the full CC0 dedication offline', 'resultsLicenseText', 'CC0 1.0 Universal'],
    ]) {
      await page.getByText(summary, { exact: true }).click();
      await expect(page.locator('#' + id)).toBeVisible();
      await expect(page.locator('#' + id)).toContainText(text);
      await page.getByText(summary, { exact: true }).click();
    }
    await page
      .getByRole('link', { name: 'Third-party credits and notices →', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Third-party credits', exact: true }),
    ).toBeInViewport();
    await page
      .getByText('Read the time-zone code and ODbL data notices offline', { exact: true })
      .click();
    await expect(page.locator('#timezoneNotices')).toContainText('Open Database License');
    await expect(page.locator('#astronomyNotices')).toContainText(
      'Copyright (c) 2019-2023 Don Cross',
    );
    await expect(page.locator('#bootstrapNotices')).toContainText('MIT License');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(errors).toEqual([]);
  });
}

for (const view of ['river', 'calendar', 'lunations'] as const) {
  test(`Docs preserves the exact ${view} plan, including history and scroll`, async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await page.evaluate((view) => {
      const a = window.__npa!;
      a.setView(view);
      a.select(
        a.nights.findIndex((n) => n.id.endsWith('-15')),
        true,
      );
      if (view === 'river') a.toggleRiverNight();
      else if (view === 'calendar') a.toggleCalendarNight();
      else a.toggleLunationsNight();
    }, view);
    await page.locator('#cv').press('ArrowDown');
    const before = await page.evaluate(() => ({
      state: JSON.stringify(window.__npa!.S),
      top: document.getElementById('scroller')!.scrollTop,
      left: document.getElementById('scroller')!.scrollLeft,
      saved: localStorage.getItem('npa:personal'),
    }));
    await page.evaluate(() => {
      (window as unknown as { rangeBefore: unknown }).rangeBefore = window.__npa!.nights;
    });
    await openGuide(page);
    await page.getByRole('link', { name: 'Read the FAQ →', exact: true }).click();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Find good nights' })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to planner' }).click();
    await expect(page.locator('#notesView')).toBeHidden();
    const after = await page.evaluate(() => ({
      state: JSON.stringify(window.__npa!.S),
      top: document.getElementById('scroller')!.scrollTop,
      left: document.getElementById('scroller')!.scrollLeft,
      saved: localStorage.getItem('npa:personal'),
    }));
    expect(after).toEqual(before);
    expect(
      await page.evaluate(
        () => (window as unknown as { rangeBefore: unknown }).rangeBefore === window.__npa!.nights,
      ),
    ).toBe(true);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();
    await page.goForward();
    await expect(page.locator('#notesView')).toBeHidden();
  });
}

test('direct section links reload and old guide links still work without computing a range', async ({
  page,
}) => {
  for (const path of ['./?docs=calculations#accuracy', './#accuracy', './?docs=unknown']) {
    await page.goto(path);
    await expect(page.locator('#notesView')).toBeVisible();
    await expect(page.locator('#docsBack')).toBeInViewport();
    expect(await page.evaluate(() => window.__npa!.nights.length)).toBe(0);
    await page.reload();
    await expect(page.locator('#notesView')).toBeVisible();
  }
  await page.goto('./?docs=privacy#timezoneNotices');
  await expect(page.locator('#timezoneNotices')).toBeVisible();
  await expect(page.locator('#docsCurrentPage')).toHaveText('Licenses and credits');
  expect(await page.evaluate(() => window.__npa!.nights.length)).toBe(0);
  await page.getByRole('link', { name: 'Back to planner' }).click();
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => window.__npa!.nights.length)).toBeGreaterThan(400);
});

test('Docs preserves a temporary included-site shared plan without copying its site into docs URLs', async ({
  page,
}) => {
  await page.goto(
    './#npa=1&view=lunations&start=2026-09&night=2026-10-09&expanded=1&name=Public+example&lat=47&lon=-122&tz=America/Los_Angeles&moonAlt=5',
  );
  await expect(page.locator('#loading')).toBeHidden();
  const before = await page.evaluate(() => ({
    url: location.href,
    state: JSON.stringify(window.__npa!.S),
    saved: localStorage.getItem('npa:personal'),
  }));
  await openGuide(page);
  expect(page.url()).not.toContain('lat=');
  expect(page.url()).not.toContain('Public');
  await page.getByRole('link', { name: 'Back to planner' }).click();
  expect(
    await page.evaluate(() => ({
      url: location.href,
      state: JSON.stringify(window.__npa!.S),
      saved: localStorage.getItem('npa:personal'),
    })),
  ).toEqual(before);
});

test('opening an example reproduces its night in a separate temporary plan', async ({ page }) => {
  await page.goto('./?docs=using#moon-example');
  await page.locator('[data-example-setting="crescent"]').click();
  const saved = await page.evaluate(() => localStorage.getItem('npa:personal'));
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-example-link="moon"]').click();
  const popup = await popupPromise;
  await expect(popup.locator('#loading')).toBeHidden();
  await expect(popup.locator('#riverSelection')).toContainText('7h 17m usable dark');
  expect(
    await popup.evaluate(() => ({
      date: window.__npa!.nights[window.__npa!.S.sel].id,
      shared: window.__npa!.S.sharedSettings,
      view: window.__npa!.S.view,
    })),
  ).toEqual({ date: '2026-09-06', shared: true, view: 'river' });
  expect(await page.evaluate(() => localStorage.getItem('npa:personal'))).toBe(saved);
  await expect(page.locator('#notesView')).toBeVisible();
  await popup.close();
});

for (const width of [390, 320]) {
  test(`Docs keeps navigation visible when jumping and scrolling at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./?docs=using#moon-example');
    await expect(page.locator('#moon-example')).toBeInViewport();
    await expect(page.locator('#docsBack')).toBeInViewport();
    await expect(page.locator('#docsContents > summary')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator('#docsContents > summary').click();
    await page.getByRole('link', { name: 'How it works', exact: true }).click();
    await page.locator('#docsContents > summary').click();
    await page.getByRole('link', { name: 'Accuracy', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Accuracy and limits' })).toBeInViewport();
    await expect(page.locator('#docsBack')).toBeInViewport();
  });
}
