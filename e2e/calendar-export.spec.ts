import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { DEFAULT_SITES } from '../src/app/default-sites';
import { readSharedPlan } from '../src/app/share-state';
import { openAppMenu } from './header-controls';
import { readPersonal, seedPersonal } from './storage';

test('downloads the previewed calendar events with site privacy off by default', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-06T22:00:00Z'));
  const site = { ...DEFAULT_SITES[0], name: 'Private observing site 🌙' };
  await seedPersonal(page, { site });
  await page.goto('./');
  await expect(page.locator('#loading')).toBeHidden();
  const before = await readPersonal(page);
  await openAppMenu(page);
  await page.getByRole('menuitem', { name: 'Export to calendar…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export to calendar' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('From', { exact: true })).toHaveValue('2026-11-06');
  await expect(dialog.getByLabel('Through', { exact: true })).toHaveValue('2026-12-05');
  await expect(dialog.getByText('3 events in file')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /Best dark weekend/ })).toBeVisible();
  await dialog.getByLabel('Through', { exact: true }).fill('2026-11-08');
  await dialog.getByLabel('Nights with usable dark').check();
  await dialog.getByRole('spinbutton').fill('645');
  await expect(dialog.getByText('5 events in file')).toBeVisible();
  await dialog.getByLabel('Preview an event').selectOption('nights');
  await expect(dialog.getByRole('heading', { name: /NPA · .* usable · .*% Moon/ })).toBeVisible();
  await dialog.getByText('More event details', { exact: true }).click();
  await expect(dialog.getByText(/Sunrise: Nov 7/)).toBeVisible();
  await dialog.getByLabel('Preview an event').selectOption('moons');
  await expect(dialog.getByRole('heading', { name: 'New moon', exact: true })).toBeVisible();
  await expect(dialog.getByText('Sun Nov 8 → Mon Nov 9')).toBeVisible();
  await expect(dialog.getByText(/Sunrise: Nov 9/)).toBeVisible();
  await dialog.getByText('Site privacy').click();
  const include = dialog.getByLabel('Include this site in Atlas links');
  await expect(include).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  if (process.env.SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-calendar-export.png`,
    });

  const download = async () => {
    const saved = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download .ics' }).click();
    const file = await saved;
    expect(file.suggestedFilename()).toBe('atlas-2026-11-06-to-2026-11-08.ics');
    await expect(page.getByRole('dialog', { name: 'Import your file' })).toContainText(
      'File → Import',
    );
    return (await readFile((await file.path())!, 'utf8')).replace(/\r\n /g, '');
  };
  const privateFile = await download();
  expect(privateFile.match(/BEGIN:VEVENT/g)).toHaveLength(5);
  expect(privateFile.match(/TRANSP:TRANSPARENT/g)).toHaveLength(5);
  const newMoon = privateFile
    .split('BEGIN:VEVENT')
    .find((event) => event.includes('SUMMARY:New moon'));
  expect(newMoon).toContain('Sun Nov 8 → Mon Nov 9');
  expect(newMoon).toContain('UTC');
  expect(newMoon).toContain('Usable dark:');
  expect(newMoon).toContain('Sunrise: Nov 9');
  expect(privateFile).toContain(
    'DTSTART;VALUE=DATE:20261106\r\nDTEND;VALUE=DATE:20261108\r\nTRANSP:TRANSPARENT\r\nSUMMARY:Best dark weekend',
  );
  expect(privateFile).not.toContain(site.name);
  expect(privateFile).not.toContain(String(site.lat));
  const links = (ics: string) =>
    [...ics.matchAll(/^URL:(.*)$/gm)].map((match) => readSharedPlan(new URL(match[1]).hash));
  expect(links(privateFile).every((plan) => plan?.view === 'calendar' && !plan.site)).toBe(true);

  await page.getByRole('button', { name: 'Back to export' }).click();
  await include.check();
  const sharedFile = await download();
  expect(links(sharedFile).every((plan) => plan?.site?.name === site.name)).toBe(true);
  expect(sharedFile.match(/^UID:.*$/gm)).toEqual(privateFile.match(/^UID:.*$/gm));
  await page.keyboard.press('Escape');
  await expect(page.locator('#moreBtn')).toBeFocused();
  expect(await readPersonal(page)).toEqual(before);
});
