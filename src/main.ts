import { boot } from './app/shell';
import { initControls } from './ui/controls';
import { initSharing } from './ui/share';
import { personal } from './app/personal-data';

await personal.initialize();
initControls();
initSharing();
boot();
