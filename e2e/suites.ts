/** Visual/interaction checks that can reuse prepared, real calculation data. */
export const UI_SPECS = [
  'accessibility',
  'calendar',
  'dark-weekends',
  'guide',
  'header',
  'lunations',
  'moonlight',
  'night-reader',
  'panel-header',
  'phone-layout',
  'polar',
  'river',
  'river-expansion',
  'site-clock',
  'theme',
  'ui-fixture',
].map((name) => `**/${name}.spec.ts`);
