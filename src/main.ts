import { boot } from './app/shell';
import { initControls } from './ui/controls';
import { initSharing } from './ui/share';
import { personal } from './app/personal-data';
import { initOffline } from './app/offline';

await personal.initialize();
initControls();
initSharing();
boot();
void initOffline();
