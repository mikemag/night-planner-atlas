import type { Page } from '@playwright/test';
import { currentSite, freshPersonalData, type PersonalData } from '../src/app/personal-data';
import type { Site } from '../src/model/night';

let seedId = 0;
export async function seedPersonal(
  page: Page,
  options: Partial<PersonalData> & { site?: Site } = {},
) {
  const { site, ...patch } = options;
  if (site) patch.active = { site };
  await page.addInitScript(
    ({ defaults, patch, marker }) => {
      if (localStorage.getItem(marker)) return;
      const before = JSON.parse(localStorage.getItem('npa:personal') ?? 'null') ?? defaults;
      const value = {
        ...before,
        ...patch,
        preferences: { ...before.preferences, ...patch.preferences },
      };
      localStorage.setItem('npa:personal', JSON.stringify(value));
      localStorage.setItem(marker, '1');
    },
    { defaults: freshPersonalData(), patch, marker: `npa:test-seed:${++seedId}` },
  );
}
export async function readPersonal(page: Page): Promise<PersonalData> {
  return (
    (await page.evaluate(() => JSON.parse(localStorage.getItem('npa:personal')!))) ??
    freshPersonalData()
  );
}
export async function readSite(page: Page) {
  return currentSite(await readPersonal(page));
}
export async function readPreference(page: Page, key: keyof PersonalData['preferences']) {
  return (await readPersonal(page))?.preferences[key] ?? null;
}
