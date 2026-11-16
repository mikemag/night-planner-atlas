import { openCurrentSiteEditor } from './site-controls';
import { chooseTheme, openGuide, openShare } from './header-controls';
import { expect, test } from '@playwright/test';

function contrast(foreground: string, background: string): number {
  const luminance = (css: string) => {
    const [r, g, b] = css
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

for (const width of [1512, 390]) {
  test(`keycaps and sharing checkmarks retain contrast in every palette at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 920 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    await openGuide(page);
    await page.getByRole('link', { name: 'See two example nights →', exact: true }).click();
    for (const theme of ['light', 'dark', 'observing']) {
      await chooseTheme(page, theme);
      const keycap = await page
        .locator('kbd')
        .first()
        .evaluate((element) => {
          const css = getComputedStyle(element);
          return { foreground: css.color, background: css.backgroundColor };
        });
      expect(contrast(keycap.foreground, keycap.background)).toBeGreaterThanOrEqual(4.5);
      if (process.env.SCREENSHOTS) {
        await page.locator('.guide-shortcuts').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-keycaps-${width}-${theme}.png`,
        });
      }
      await page.getByRole('link', { name: 'Back to planner' }).click();
      await openShare(page);
      const checkbox = page.getByRole('checkbox', { name: 'Include this site', exact: true });
      await checkbox.check();
      const check = await checkbox.evaluate((element) => {
        const css = getComputedStyle(element);
        const stroke = decodeURIComponent(css.backgroundImage).match(
          /\bstroke=['"]([^'"]+)['"]/,
        )?.[1];
        if (!stroke) throw new Error('The checkbox SVG has no checkmark stroke.');
        const sample = document.createElement('span');
        sample.hidden = true;
        sample.style.color = stroke;
        document.body.appendChild(sample);
        const foreground = getComputedStyle(sample).color;
        sample.remove();
        return { foreground, background: css.backgroundColor };
      });
      expect(contrast(check.foreground, check.background)).toBeGreaterThanOrEqual(3);
      if (process.env.SCREENSHOTS)
        await page.screenshot({
          path: `test-results/screenshots/${info.project.name}-checkbox-${width}-${theme}.png`,
        });
      await page.keyboard.press('Escape');
      await openGuide(page);
      await page.getByRole('link', { name: 'See two example nights →', exact: true }).click();
    }
  });
}

test('the sharing checkbox visibly distinguishes checked and unchecked in forced colors', async ({
  page,
  browserName,
}, info) => {
  test.skip(browserName !== 'chromium', 'Chromium provides forced-color emulation.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await openShare(page);
  const checkbox = page.getByRole('checkbox', { name: 'Include this site', exact: true });
  const interior = async () => {
    const box = (await checkbox.boundingBox())!;
    // Compare only the mark area: borders, focus rings and fractional edges cannot mask a missing check.
    return page.screenshot({
      clip: {
        x: Math.ceil(box.x) + 3,
        y: Math.ceil(box.y) + 3,
        width: Math.floor(box.width) - 6,
        height: Math.floor(box.height) - 6,
      },
    });
  };
  await checkbox.focus();
  const unchecked = await interior();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  const checked = await interior();
  expect(checked, 'The checked mark must be visible against its background.').not.toEqual(
    unchecked,
  );
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-checkbox-forced-colors.png`,
    });
  await page.keyboard.press('Space');
  await expect(checkbox).not.toBeChecked();
});

test('River keyboard tasks include visible focus, minimap browsing and contained dialog keys', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#cv').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#riverSelection')).toContainText('Times in America/Los_Angeles.');
  expect(await page.locator('#cv').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    'solid',
  );
  await page.keyboard.press('Enter');
  await expect(page.locator('#cv')).toHaveAttribute('aria-expanded', 'true');
  const selected = await page.evaluate(() => window.__npa!.S.sel);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('scrollbar', { name: 'Browse River dates' })).toBeFocused();
  const before = await page.locator('#scroller').evaluate((el) => el.scrollTop);
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => page.locator('#scroller').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(before);
  await page.keyboard.press('Home');
  await expect.poll(() => page.locator('#scroller').evaluate((el) => el.scrollTop)).toBe(0);
  await page.keyboard.press('End');
  await expect
    .poll(() =>
      page.locator('#scroller').evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop),
    )
    .toBeLessThan(2);
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(selected);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#cv')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cv')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#siteSel').focus();
  await openCurrentSiteEditor(page);
  await expect(page.getByRole('dialog', { name: 'Observing sites' })).toBeVisible();
  await page.locator('#siteCancel').focus();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.__npa!.S.sel)).toBe(selected);
  await page.keyboard.press('Escape');
  await expect(page.locator('#siteSel')).toBeFocused();
});

for (const width of [320, 390]) {
  test(`shared controls fit and remain usable at ${width}px in every palette`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    await expect(page.locator('#loading')).toBeHidden();
    for (const theme of ['light', 'dark', 'observing']) {
      await chooseTheme(page, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const targets = await page
        .locator('#planSettingsBtn, #moreBtn, #siteSel')
        .evaluateAll((nodes) =>
          nodes.map((el) => {
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height };
          }),
        );
      expect(targets.every((r) => r.width >= 24 && r.height >= 24)).toBe(true);
    }
    await openCurrentSiteEditor(page);
    await expect(page.locator('#siteApply')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('forced colors and reduced motion retain visible chart focus and readable expanded facts', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Chromium provides forced-color emulation.');
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#cv').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#riverDetail')).toBeVisible();
  expect(await page.locator('#cv').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    'solid',
  );
  await expect(page.locator('#riverSelection')).toContainText('usable dark');
  await openCurrentSiteEditor(page);
  await expect(page.getByLabel('Coordinates or full Google Maps link')).toBeVisible();
});
