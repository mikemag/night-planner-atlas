# Hosting Night Planner Atlas

Night Planner Atlas uses classic Firebase Hosting: static files on Google's CDN with managed HTTPS.
The public address is <https://night-planner-atlas.web.app/>; no custom domain is configured.
The dedicated Google Cloud/Firebase
project and Hosting site ID are both `night-planner-atlas`. Billing is disabled with no linked
billing account. The initial deployment published four static files from baseline `9bda707`
plus this Hosting configuration on October 18, 2026.

Firebase serves only the Vite build in `dist/`, excluding source maps. The AGPL source and build
instructions are in the public [GitHub repository](https://github.com/mikemag/night-planner-atlas).
There is no GitHub integration, cloud build, cloud test run, backend, Firebase browser
SDK, analytics, or service-account key. All checks and builds run on the deploying laptop.

Use a dedicated Firebase project on **Spark**, without linking a Cloud Billing account.
Hosting includes 10 GB of stored releases and 10 GB/month of transfer at no cost. Spark blocks
new deploys at the storage limit; exceeding transfer quota can disable serving until the next
month. Monitor the Hosting usage dashboard and prune old releases when necessary, retaining
known-good rollback versions. Do not upgrade to Blaze automatically. Quotas are project-wide.
Future Auth and Firestore work can use this project, but needs its own privacy, security-rule,
region and cost decisions before enabling services or shipping SDKs.

The site is publicly reachable without sign-in. The current `X-Robots-Tag` response header asks
search engines not to index it; it is not access control. Search indexing and broader release
remain tracked in issue #15.

## Deploy and redeploy from this laptop

Use Node 24.11.1 through fnm and the installed Firebase CLI (initially 14.19.1):

```bash
cd ~/dev/night-planner-atlas
eval "$(fnm env)"
fnm use 24.11.1
node --version
firebase --version
firebase login:list
```

If necessary, sign in interactively with `firebase login`. Credentials stay in the CLI's user
configuration outside the repository. Never put tokens, service-account files or secrets in
the repo or Vite environment variables: browser build variables are public.

```bash
npm ci
npm run deploy
```

`npm run deploy` runs `npm run check:full` (regular checks, numerical audits and all browser tests), then
`firebase deploy --only hosting --project night-planner-atlas`, stopping on any failure.
For visual review before publishing, run these individual steps instead:

```bash
npm run check:full && npm run screenshots
# Inspect the captures before publishing:
firebase deploy --only hosting --project night-planner-atlas
```

`npm run screenshots` captures the curated view/theme cases headlessly. It builds its own
production preview on port 4174 and refuses an existing server. It supplements the full gate;
it does not replace the integration tests or numerical audits. Omit the capture step when
screenshots are unnecessary. Do not alter
`dist/` between checks and deployment. The explicit project flag avoids deploying to AllSky
or another active CLI project. Do not run `firebase init`, which can overwrite the config.

`firebase.json` publishes only `dist/`. The HTML at `/` and `/index.html` and the service worker
at `/sw.js` use `no-cache` so browsers can discover releases. Vite's hashed `/assets/` files use a year of immutable
caching. The unversioned favicon caches for an hour. No catch-all rewrite is needed: views
live at `/`, and unknown paths should return 404. Hosting deploys are atomic.

After every deployment, open the printed HTTPS URL. Check River, Calendar, Lunations,
Dark Weekends and Docs at desktop and phone widths in Light and Dark, with no horizontal page scroll. Change
the site, IANA zone, optional elevation and planning controls, reload, and check persistence.
With a browser zone different from the observing site, verify the expanded night's site-local times.
Inspect network requests: only same-origin static files should load; site edits and view changes
must not issue requests or change the URL. Disconnect the network after loading and verify
that views and calculations still work. Once More shows **Ready to reopen offline**, test a
reload and a fresh tab with a direct Docs link while offline. Check HTML, worker and hashed
asset cache response headers.

## Roll back

In the [Firebase Hosting console](https://console.firebase.google.com/project/night-planner-atlas/hosting),
open the site's **Release history**, find the known-good previous release, open its menu and
choose **Roll back**. This restores that release's files and Hosting configuration together
without rebuilding. Reload the same HTTPS URL and repeat the checks above. A rollback is
available only while that version is retained; do not delete known-good releases prematurely.
The first deployment has no previous version to restore.

The initial version ID is `5a2411acacd603b3`. After a later deploy, the installed CLI can
restore that exact retained version to the live channel:

```bash
firebase hosting:clone night-planner-atlas@5a2411acacd603b3 night-planner-atlas:live --project night-planner-atlas
```

Use `firebase hosting:channel:list --project night-planner-atlas --json` to read the current
live version before a redeploy. Record deployment/version references in issue #4, rather than
adding a running release log here.

If the old release was deleted, check out the known-good Git commit in a separate local
checkout, install with `npm ci`, run the same checks and deploy commands there. Use the
explicit project flag and preserve this Hosting config if that commit predates it. A Hosting
rollback does not erase browser localStorage; future incompatible settings changes need a
separate migration decision.

## Access and saved settings

Open the shared `https://night-planner-atlas.web.app/` URL in a modern browser; no account or
installation is needed. Choose **Manage sites…** at the bottom of the site picker to add or edit
coordinates, an IANA time zone and optional elevation, or to reorder sites.
All displayed times use that site's zone, including daylight saving. On phones, tap the labeled
countdown for **Live details**, including the site's clock and zone.

Settings and the observing site are saved **only in that browser on that device**. They do not
sync between machines, browser profiles, or the `web.app` and `firebaseapp.com` hostnames.
Use the same `web.app` bookmark consistently. Private browsing or clearing site data can
remove settings. Coordinates stay in browser storage and calculations; there is no upload.
The hosting provider still handles ordinary static-file requests and connection metadata.

**More → Browser data → Backup and restore** exports sites, order, saved selection and preferences
or imports a reviewed replacement. The separate recovery copy holds one previous document from
before import, preference reset or a saved-data upgrade; it is not an edit history. Downloaded
backups and deliberately shared site-bearing links contain site details. Share site opens Around
now with the recipient's settings and reuses or saves the site; Share plan carries the chosen
dates and settings and includes a site only when selected. Link data stays in the URL fragment.

Open the planner online and wait for **Ready to reopen offline** in More. The same address
then works on reload or in a new tab in the same browser while offline. Visit online again if
the browser clears the app files.

The production build generates a service worker with a versioned list of the HTML, favicon and
built assets, including the time-zone worker and WASM. Installation verifies the contents before
publishing the cached copy. Online navigations use Hosting, so they see releases and rollbacks
normally. A failed navigation to the planner or Docs uses the saved HTML and its matching hashed
assets. The separately offered boundary dataset download requires a connection.

An updated offline copy becomes active after all tabs using the older copy close. Activation
removes obsolete app caches for the same scope. Saved sites, preferences and calculated nights
use separate browser storage. The Vite development server does not register a service worker.

Provider references: [Hosting setup](https://firebase.google.com/docs/hosting/quickstart),
[configuration](https://firebase.google.com/docs/hosting/full-config),
[quotas and pricing](https://firebase.google.com/docs/hosting/usage-quotas-pricing),
[releases and rollback](https://firebase.google.com/docs/hosting/manage-hosting-resources).
