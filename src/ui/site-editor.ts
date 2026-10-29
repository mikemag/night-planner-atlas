import { store } from '../app/settings';
import { readSiteBook, siteRecord } from '../app/site-book';
import { applySite } from '../app/shell';
import { S } from '../app/state';
import type { Site } from '../model/night';
import { isSite, parseSiteInput, type Coordinates } from '../model/site-input';
import { el } from './dom';
import { bindSiteZone } from './site-zone';

/** Favorites are saved together; every form edit stays in a draft until Save & use. */
export function initSiteEditor(): void {
  const dialog = el<HTMLDialogElement>('sitePop');
  const form = el<HTMLFormElement>('siteForm');
  const favorites = el<HTMLSelectElement>('siteFavorite');
  const name = el<HTMLInputElement>('siteName');
  const location = el<HTMLInputElement>('siteLocation');
  const elevation = el<HTMLInputElement>('siteElevation');
  const zone = el<HTMLInputElement>('siteTz');
  const status = el('siteZoneStatus');
  const error = el('siteErr');
  const raw = store.raw('favorites');
  const { book, readable } = readSiteBook(raw, S.site);
  let storageFailed = !readable;
  let editingId: string | null = null;
  let point: Coordinates | null = null;
  let coordinateError = '';
  const lookup = bindSiteZone(
    () => point,
    zone,
    status,
    el<HTMLDataListElement>('siteZoneChoices'),
  );
  const storageWarning = readable
    ? 'This site is active for this tab. Browser storage is unavailable, so changes cannot be kept after closing.'
    : raw === undefined
      ? 'Browser storage is unavailable. Sites can be used in this tab but cannot be kept after closing.'
      : 'Saved favorites could not be read. Their stored data was left unchanged; changes are temporary in this tab.';
  const persist = () => {
    const saved = readable && store.set('favorites', book);
    storageFailed = !saved;
    if (!saved) {
      el('siteStorageNotice').textContent = storageWarning;
      el('siteStorageNotice').hidden = false;
      el('siteStorage').textContent = storageWarning;
    }
    return saved;
  };
  const fail = (message: string) => {
    error.textContent = message;
    error.hidden = false;
  };
  const preview = () => {
    el('siteCoordinates').textContent = point
      ? `Latitude ${point.lat}°, longitude ${point.lon}°`
      : 'The point’s coordinates will appear here before you save.';
  };
  const fill = (site: Site | null, id: string | null) => {
    lookup.cancel();
    editingId = id;
    name.value = site?.name ?? '';
    location.value = site ? `${site.lat}, ${site.lon}` : '';
    elevation.value = site?.elevation == null ? '' : String(site.elevation);
    zone.value = site?.tz ?? '';
    point = site ? { lat: site.lat, lon: site.lon } : null;
    coordinateError = '';
    error.hidden = true;
    el('siteRemoval').hidden = true;
    status.textContent = site
      ? 'Check this IANA zone; you can edit it. Coordinate changes infer a new zone.'
      : 'Paste coordinates to find the time zone offline.';
    favorites.replaceChildren();
    if (id === null) favorites.appendChild(new Option(site ? 'Unsaved site' : 'New site', ''));
    for (const favorite of book.sites)
      favorites.appendChild(
        new Option(
          `${favorite.name} · ${favorite.lat.toFixed(3)}, ${favorite.lon.toFixed(3)} · ${favorite.tz}`,
          favorite.id,
        ),
      );
    favorites.value = id ?? '';
    el('siteEditTarget').textContent = id
      ? `Editing ${book.sites.find((site) => site.id === id)!.name}`
      : 'New favorite';
    el<HTMLButtonElement>('siteRemove').disabled = id === null;
    preview();
    el('siteStorage').textContent = storageFailed
      ? storageWarning
      : 'Favorites and preferences stay in this browser. No account is needed.';
  };
  el('siteBtn').addEventListener('click', () => {
    const active = book.sites.find((favorite) => favorite.id === book.selectedId);
    const matches =
      active && JSON.stringify(siteRecord(active)) === JSON.stringify(siteRecord(S.site));
    fill(S.site, matches ? active.id : null);
    dialog.showModal();
    favorites.focus();
  });
  for (const id of ['siteCancel', 'siteClose'])
    el(id).addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    lookup.cancel();
    el('siteBtn').focus({ preventScroll: true });
  });
  favorites.addEventListener('change', () => {
    const favorite = book.sites.find((site) => site.id === favorites.value);
    if (favorite) fill(favorite, favorite.id);
  });
  el('siteAdd').addEventListener('click', () => {
    fill(null, null);
    location.focus();
  });
  el('siteDuplicate').addEventListener('click', () => {
    const original = book.sites.find((site) => site.id === editingId) ?? S.site;
    fill({ ...original, name: `${original.name} copy` }, null);
    name.focus();
    name.select();
  });
  el('siteRemove').addEventListener('click', () => {
    const favorite = book.sites.find((site) => site.id === editingId);
    if (!favorite) return;
    el('siteRemoveName').textContent = favorite.name;
    el('siteRemoval').hidden = false;
    el('siteKeep').focus();
  });
  el('siteKeep').addEventListener('click', () => {
    el('siteRemoval').hidden = true;
    el('siteRemove').focus();
  });
  el('siteConfirmRemove').addEventListener('click', () => {
    book.sites = book.sites.filter((site) => site.id !== editingId);
    if (book.selectedId === editingId) book.selectedId = null;
    persist();
    const next = book.sites.find((site) => site.id === book.selectedId) ?? book.sites[0];
    fill(next ?? S.site, next?.id ?? null);
    favorites.focus();
  });
  location.addEventListener('input', () => {
    error.hidden = true;
    try {
      point = parseSiteInput(location.value);
      coordinateError = '';
    } catch (err) {
      point = null;
      coordinateError = (err as Error).message;
    }
    preview();
    lookup.infer();
  });
  location.addEventListener('blur', () => {
    if (location.value.trim() && coordinateError) fail(coordinateError);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let coordinates: Coordinates;
    try {
      coordinates = parseSiteInput(location.value);
    } catch (err) {
      fail((err as Error).message);
      location.focus();
      return;
    }
    const metres = elevation.value.trim() === '' ? undefined : Number(elevation.value);
    if (
      elevation.validity.badInput ||
      (metres != null && (!Number.isFinite(metres) || metres < -500 || metres > 10000))
    ) {
      fail('Elevation must be between −500 and 10,000 metres above sea level, or left blank.');
      elevation.focus();
      return;
    }
    const site: Site = {
      name: name.value.trim() || 'Custom site',
      ...coordinates,
      tz: zone.value.trim(),
      ...(metres == null ? {} : { elevation: metres }),
    };
    if (!isSite(site)) {
      fail(`“${zone.value.trim()}” is not a time zone name. Try America/Los_Angeles.`);
      zone.focus();
      return;
    }
    const id = editingId ?? crypto.randomUUID();
    if (editingId)
      book.sites = book.sites.map((favorite) =>
        favorite.id === id ? { ...favorite, ...site, elevation: site.elevation } : favorite,
      );
    else book.sites.push({ ...site, id });
    book.selectedId = id;
    const saved = persist();
    dialog.close();
    applySite(site, saved);
  });
}
