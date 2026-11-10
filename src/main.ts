import { boot } from './app/shell';
import { initControls } from './ui/controls';
import { initSharing } from './ui/share';
import { personal } from './app/personal-data';
import { initOffline } from './app/offline';
import { initCalendarExport } from './ui/calendar-export';

// The built module precedes its CSS link. WebKit can evaluate it before that stylesheet
// loads, so wait before reading theme tokens or measuring any controls.
await Promise.all(
  [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((link) => {
    if (link.sheet) return;
    return new Promise<void>((resolve, reject) => {
      link.addEventListener('load', () => resolve(), { once: true });
      link.addEventListener('error', () => reject(new Error('Unable to load app styles.')), {
        once: true,
      });
    });
  }),
);

await personal.initialize();
initControls();
await initSharing();
initCalendarExport();
boot();
void initOffline();
