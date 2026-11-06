/* global release */

const scope = self.registration.scope;
const cachePrefix = `npa:offline:${scope}:`;
const cacheName = cachePrefix + release.version;
// The manifest verifies one representation of each static file.
const cacheOptions = { cacheName, ignoreVary: true };
const shell = new URL('index.html', scope).href;
const files = release.files.map(
  ({ path, integrity }) =>
    new Request(new URL(path, scope), {
      integrity,
      redirect: 'error',
      cache: path.startsWith('assets/') ? 'default' : 'reload',
    }),
);
const assetURLs = new Set(files.filter(({ url }) => url !== shell).map(({ url }) => url));

let preparing;
function prepare() {
  return (preparing ??= (async () => {
    const cache = await caches.open(cacheName);
    // addAll stores the release as a batch. Integrity also catches a deployment mid-install.
    if ((await cache.keys()).length !== files.length) await cache.addAll(files);
  })().finally(() => {
    preparing = undefined;
  }));
}

self.addEventListener('install', (event) => event.waitUntil(prepare()));

self.addEventListener('activate', (event) => {
  // The browser waits for old clients to leave before activating an update.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener('message', (event) => {
  const port = event.ports[0];
  if (event.data !== 'npa:offline-status' || !port) return;
  event.waitUntil(
    prepare().then(
      () => port.postMessage(true),
      () => port.postMessage(false),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    url.search = '';
    url.hash = '';
    if (url.href !== scope && url.href !== shell) return;
    // Keep online releases and rollbacks visible. Only a failed navigation uses the saved shell.
    event.respondWith(
      fetch(request).catch(
        async () => (await caches.match(shell, cacheOptions)) ?? Response.error(),
      ),
    );
  } else if (assetURLs.has(request.url)) {
    // Asset filenames are content-hashed. A newer online shell can fetch its new assets normally.
    event.respondWith(
      caches.match(request, cacheOptions).then((cached) => cached ?? fetch(request)),
    );
  }
});
