# Hosting the Helen preview

The preview uses classic Firebase Hosting: static files on Google's CDN with managed HTTPS.
The shared URL is <https://night-planner-atlas.web.app/>. The dedicated Google Cloud/Firebase
project and Hosting site ID are both `night-planner-atlas`. Billing is disabled with no linked
billing account. The initial deployment published four static files from baseline `9bda707`
plus this Hosting configuration on October 18, 2026.

The repository stays private. Only the Vite build in `dist/` is published, excluding source
maps. There is no GitHub integration, cloud build, cloud test run, backend, Firebase browser
SDK, analytics, or service-account key. All checks and builds run on the deploying laptop.

Use a dedicated Firebase project on **Spark**, without linking a Cloud Billing account.
Hosting includes 10 GB of stored releases and 10 GB/month of transfer at no cost. Spark blocks
new deploys at the storage limit; exceeding transfer quota can disable serving until the next
month. Monitor the Hosting usage dashboard and prune old releases when necessary, retaining
known-good rollback versions. Do not upgrade to Blaze automatically. Quotas are project-wide.
Future Auth and Firestore work can use this project, but needs its own privacy, security-rule,
region and cost decisions before enabling services or shipping SDKs.

This is a publicly reachable preview without sign-in. The `X-Robots-Tag` response header asks
search engines not to index it; it is not access control. The public-launch work in issue #15,
including the Git/GitHub history privacy review, remains separate.

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

`npm run deploy` runs `npm run check`, then `npm run test:e2e`, then
`firebase deploy --only hosting --project night-planner-atlas`, stopping on any failure.
For visual review before publishing, run these individual steps instead:

```bash
npm run check && npm run screenshots && firebase deploy --only hosting --project night-planner-atlas
```

`npm run screenshots` runs the full local
Playwright suite, builds its own production preview on port 4174, and refuses an existing
server. `npm run test:e2e` can replace it when screenshots are unnecessary. Do not alter
`dist/` between checks and deployment. The explicit project flag avoids deploying to AllSky
or another active CLI project. Do not run `firebase init`, which can overwrite the config.

`firebase.json` publishes only `dist/`. HTML at `/` and `/index.html` uses `no-cache`, so
reloads revalidate against the server. Vite's hashed `/assets/` files use a year of immutable
caching. The unversioned favicon caches for an hour. No catch-all rewrite is needed: views
live at `/`, and unknown paths should return 404. Hosting deploys are atomic.

After every deployment, open the printed HTTPS URL. Check River, Calendar, Lunations, Table
and Notes at desktop and phone widths in both themes, with no horizontal page scroll. Change
the site, IANA zone, optional elevation and planning controls, reload, and check persistence.
With a browser zone different from the observing site, verify the inspector's site-local times.
Inspect network requests: only same-origin static files should load; site edits and view changes
must not issue requests or change the URL. Disconnect the network after loading and verify
that views and calculations still work. Check HTML and hashed asset cache response headers.

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

## Helen's access and saved settings

Open the shared `https://night-planner-atlas.web.app/` URL in a modern browser; no account or
installation is needed. Use the site button to enter latitude, longitude, an IANA time zone
and optional elevation. All displayed times use that site's zone, including daylight saving.

Settings and the observing site are saved **only in that browser on that device**. They do not
sync between machines, browser profiles, or the `web.app` and `firebaseapp.com` hostnames.
Use the same `web.app` bookmark consistently. Private browsing or clearing site data can
remove settings. Coordinates stay in browser storage and calculations; there is no upload.
The hosting provider still handles ordinary static-file requests and connection metadata.

Once loaded, calculations and view changes work without a network connection. A new offline
visit or offline reload is not guaranteed: there is no service worker or offline installation.

Provider references: [Hosting setup](https://firebase.google.com/docs/hosting/quickstart),
[configuration](https://firebase.google.com/docs/hosting/full-config),
[quotas and pricing](https://firebase.google.com/docs/hosting/usage-quotas-pricing),
[releases and rollback](https://firebase.google.com/docs/hosting/manage-hosting-resources).
