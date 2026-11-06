import { el } from '../ui/dom';

function checkCopy(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    const finish = (ready: boolean) => {
      window.clearTimeout(timeout);
      port1.close();
      resolve(ready);
    };
    const timeout = window.setTimeout(() => finish(false), 60_000);
    port1.onmessage = (event) => finish(event.data === true);
    try {
      worker.postMessage('npa:offline-status', [port2]);
    } catch {
      finish(false);
    }
  });
}

export async function initOffline(): Promise<void> {
  if (!import.meta.env.PROD) return;
  const status = el('offlineStatus');
  const preparing = 'Preparing offline access…';
  const failed = 'Offline setup couldn’t finish. Reload while online to try again.';
  status.hidden = false;
  status.textContent = preparing;
  try {
    if (!navigator.serviceWorker) {
      status.textContent = 'Offline reopening is unavailable in this browser.';
      return;
    }
    const registration = await navigator.serviceWorker.register(new URL('./sw.js', location.href), {
      updateViaCache: 'none',
    });
    let refresh = 0;
    const update = async () => {
      const token = ++refresh;
      const active = registration.active;
      if (active?.state !== 'activated') {
        status.textContent = registration.installing || active ? preparing : failed;
        return;
      }
      const ready = await checkCopy(active);
      if (refresh !== token) return;
      status.textContent = registration.waiting
        ? 'Offline update ready. Close all Atlas tabs and reopen to use it.'
        : ready
          ? 'Ready to reopen offline'
          : failed;
    };
    const watch = () => {
      registration.installing?.addEventListener('statechange', () => void update());
      void update();
    };
    registration.addEventListener('updatefound', watch);
    void navigator.serviceWorker.ready.then(update);
    watch();
  } catch {
    status.textContent = failed;
  }
}
