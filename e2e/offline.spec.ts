import { expect, test as base } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';
import { openAppMenu, chooseMoon, shiftPlanningRange } from './header-controls';
import { readPreference } from './storage';

const test = base.extend<{ origin: PreviewServer }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture dependencies.
  origin: async ({}, use) => {
    const server = await preview({
      configFile: false,
      preview: { host: '127.0.0.1', port: 0, headers: { 'Cache-Control': 'no-store' } },
    });
    try {
      await use(server);
    } finally {
      await server.close();
    }
  },
});

test('reopens the planner and direct Docs links offline after online setup', async ({
  page,
  context,
  origin,
}, info) => {
  const url = new URL(origin.resolvedUrls!.local[0]);
  await page.goto(url.href);
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#siteSel').selectOption('site:sydney-linden-observatory');
  await expect(page.locator('#loading')).toBeHidden();
  await chooseMoon(page, 'moonAltSel', '10');
  await expect.poll(() => readPreference(page, 'moonAlt')).toBe(10);

  await openAppMenu(page);
  await expect(page.locator('#offlineStatus')).toHaveText('Ready to reopen offline', {
    timeout: 20_000,
  });
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-offline-ready.png`,
    });
  await page.close();
  // Shut down the origin so the browser must handle actual connection failures.
  await origin.close();

  const fresh = await context.newPage();
  await fresh.goto(url.href);
  await expect(fresh.locator('#loading')).toBeHidden();
  await expect(fresh.locator('#siteSel option:checked')).toContainText('Sydney');
  await expect(fresh.locator('#moonAltSel')).toHaveValue('10');
  await openAppMenu(fresh);
  await expect(fresh.locator('#offlineStatus')).toHaveText('Ready to reopen offline');
  await fresh.keyboard.press('Escape');
  const originalRange = await fresh.locator('#rangeLabel').textContent();
  await shiftPlanningRange(fresh, 'Next');
  await expect(fresh.locator('#loading')).toBeHidden();
  await expect(fresh.locator('#rangeLabel')).not.toHaveText(originalRange!);
  for (const view of ['River', 'Lunations', 'Calendar', 'Dark Weekends']) {
    const button = fresh.getByRole('button', { name: view, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(fresh.locator('#darkWeekends')).toBeVisible();

  await fresh.reload();
  await expect(fresh.locator('#loading')).toBeHidden();
  await openAppMenu(fresh);
  await fresh.getByRole('menuitem', { name: 'Export to calendar…' }).click();
  const download = fresh.waitForEvent('download');
  await fresh.getByRole('button', { name: 'Download .ics' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await fresh.keyboard.press('Escape');
  await fresh.locator('#siteSel').selectOption('manage');
  await fresh.locator('#siteLocation').fill('27.7172, 85.3240');
  await expect(fresh.locator('#siteTz')).toHaveValue('Asia/Kathmandu');
  await fresh.keyboard.press('Escape');

  const docs = new URL('index.html?docs=faq#offline', url);
  await fresh.goto(docs.href);
  await expect(fresh).toHaveURL(docs.href);
  await expect(fresh.getByRole('heading', { name: 'Can I use it offline?' })).toBeVisible();
  await fresh.reload();
  await expect(fresh).toHaveURL(docs.href);
  await expect(fresh.getByRole('heading', { name: 'Can I use it offline?' })).toBeVisible();
  await fresh.goto(new URL('index.html?docs=licenses#code-license', url).href);
  await fresh.reload();
  await fresh.getByText('Read the full AGPL-3.0 license offline', { exact: true }).click();
  await expect(fresh.locator('#codeLicenseText')).toContainText(
    'GNU AFFERO GENERAL PUBLIC LICENSE',
  );
});
