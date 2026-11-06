import { boot } from './app/shell';
import { initControls } from './ui/controls';
import { initSharing } from './ui/share';
import { personal } from './app/personal-data';
import { initOffline } from './app/offline';
import { initCalendarExport } from './ui/calendar-export';

await personal.initialize();
initControls();
initSharing();
initCalendarExport();
boot();
void initOffline();
