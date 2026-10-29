import { boot } from './app/shell';
import { initControls } from './ui/controls';
import { initSharing } from './ui/share';

initControls();
initSharing();
boot();
