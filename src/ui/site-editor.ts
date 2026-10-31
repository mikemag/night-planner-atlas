import { store } from '../app/settings';
import { readSiteBook, siteRecord } from '../app/site-book';
import { applySite } from '../app/shell';
import { S } from '../app/state';
import type { Site } from '../model/night';
import { isSite, parseSiteInput, type Coordinates } from '../model/site-input';
import { el } from './dom';
import { bindSiteZone } from './site-zone';

/** Pick saved sites directly; management edits stay in a draft until Save & use. */
export function initSiteEditor(): void {
  const picker = el<HTMLSelectElement>('siteSel');
  const dialog = el<HTMLDialogElement>('sitePop');
  const form = el<HTMLFormElement>('siteForm');
  const favorites = el<HTMLSelectElement>('siteFavorite');
  const name = el<HTMLInputElement>('siteName');
  const location = el<HTMLInputElement>('siteLocation');
  const elevation = el<HTMLInputElement>('siteElevation');
  const zone = el<HTMLInputElement>('siteTz');
  const status = el('siteZoneStatus');
  const save = el<HTMLButtonElement>('siteApply');
  const errors = new Map<HTMLInputElement, HTMLElement>([
    [location, el('siteLocationErr')],
    [elevation, el('siteElevationErr')],
    [zone, el('siteTzErr')],
  ]);
  const raw = store.raw('favorites');
  const { book, readable, migrated } = readSiteBook(raw, store.get<unknown>('site', null));
  let storageFailed = !readable;
  let editingId: string | null = null;
  let point: Coordinates | null = null;
  let coordinateError = '';
  let saveAttempt = 0;
  let opener: HTMLElement = picker;
  const matchesCurrent = (site: Site) =>
    JSON.stringify(siteRecord(site)) === JSON.stringify(siteRecord(S.site));
  const activeFavorite = () =>
    book.sites.find((site) => site.id === book.selectedId && matchesCurrent(site)) ??
    book.sites.find(matchesCurrent);
  const siteCaption = (site: Site) =>
    `${site.name} · ${Math.abs(site.lat).toFixed(2)}°${site.lat >= 0 ? 'N' : 'S'} ${Math.abs(site.lon).toFixed(2)}°${site.lon >= 0 ? 'E' : 'W'}${site.elevation == null ? '' : ` · ${site.elevation} m`}`;
  const refreshPicker = () => {
    const active = activeFavorite();
    picker.replaceChildren();
    if (!active) picker.appendChild(new Option(siteCaption(S.site), 'current'));
    for (const site of book.sites)
      picker.appendChild(new Option(siteCaption(site), `site:${site.id}`));
    picker.appendChild(new Option('Manage sites…', 'manage'));
    picker.value = active ? `site:${active.id}` : 'current';
    picker.title = siteCaption(S.site);
  };
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
  if (migrated) persist();
  const setSaving = (saving: boolean) => {
    save.disabled = saving;
    save.textContent = saving ? 'Finding time zone…' : 'Save & use site';
  };
  const cancelSave = () => {
    saveAttempt++;
    setSaving(false);
  };
  const clearError = (field: HTMLInputElement) => {
    const error = errors.get(field)!;
    error.textContent = '';
    error.hidden = true;
    field.removeAttribute('aria-invalid');
  };
  const fail = (field: HTMLInputElement, message: string) => {
    const error = errors.get(field)!;
    error.textContent = message;
    error.hidden = false;
    field.setAttribute('aria-invalid', 'true');
  };
  const preview = () => {
    const output = el('siteCoordinates');
    const fromLink = /^https?:\/\//i.test(location.value.trim()) ? point : null;
    output.hidden = !fromLink;
    output.textContent = fromLink
      ? `Coordinates from link: latitude ${fromLink.lat}°, longitude ${fromLink.lon}°`
      : '';
  };
  const fill = (site: Site | null, id: string | null) => {
    lookup.cancel();
    cancelSave();
    editingId = id;
    name.value = site?.name ?? '';
    location.value = site ? `${site.lat}, ${site.lon}` : '';
    elevation.value = site?.elevation == null ? '' : String(site.elevation);
    zone.value = site?.tz ?? '';
    point = site ? { lat: site.lat, lon: site.lon } : null;
    coordinateError = '';
    for (const field of errors.keys()) clearError(field);
    el('siteRemoval').hidden = true;
    status.textContent = site
      ? 'Clear this field to find the zone from these coordinates when saving, or enter an IANA zone to override it.'
      : 'Leave blank to find the zone from your coordinates. You can enter an IANA zone to override it.';
    favorites.replaceChildren();
    if (id === null) favorites.appendChild(new Option(site ? 'Unsaved site' : 'New site', ''));
    for (const favorite of book.sites) {
      const duplicateName = book.sites.some(
        (other) => other.id !== favorite.id && other.name === favorite.name,
      );
      favorites.appendChild(
        new Option(
          duplicateName
            ? `${favorite.name} · ${favorite.lat.toFixed(3)}, ${favorite.lon.toFixed(3)}`
            : favorite.name,
          favorite.id,
        ),
      );
    }
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
  const openEditor = (source: HTMLElement) => {
    opener = source;
    refreshPicker();
    fill(S.site, activeFavorite()?.id ?? null);
    dialog.showModal();
    favorites.focus();
  };
  picker.addEventListener('change', () => {
    if (picker.value === 'manage') {
      openEditor(picker);
      return;
    }
    const favorite = book.sites.find((site) => `site:${site.id}` === picker.value);
    if (!favorite) return;
    book.selectedId = favorite.id;
    const saved = persist();
    applySite(siteRecord(favorite), saved);
  });
  el('shareReviewSite').addEventListener('click', (event) =>
    openEditor(event.currentTarget as HTMLElement),
  );
  window.addEventListener('npa-site-change', refreshPicker);
  refreshPicker();
  for (const id of ['siteCancel', 'siteClose'])
    el(id).addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    lookup.cancel();
    cancelSave();
    opener.focus({ preventScroll: true });
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
    refreshPicker();
    const next = book.sites.find((site) => site.id === book.selectedId) ?? book.sites[0];
    fill(next ?? S.site, next?.id ?? null);
    favorites.focus();
  });
  location.addEventListener('input', () => {
    clearError(zone);
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
    if (location.value.trim() && coordinateError) fail(location, coordinateError);
  });
  form.addEventListener('input', (event) => {
    cancelSave();
    const field = event.target as HTMLInputElement;
    if (errors.has(field)) clearError(field);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const attempt = ++saveAttempt;
    for (const field of errors.keys()) clearError(field);
    let coordinates: Coordinates;
    try {
      coordinates = parseSiteInput(location.value);
    } catch (err) {
      fail(location, (err as Error).message);
      location.focus();
      return;
    }
    const metres = elevation.value.trim() === '' ? undefined : Number(elevation.value);
    if (
      elevation.validity.badInput ||
      (metres != null && (!Number.isFinite(metres) || metres < -500 || metres > 10000))
    ) {
      fail(
        elevation,
        'Elevation must be between −500 and 10,000 metres above sea level, or left blank.',
      );
      elevation.focus();
      return;
    }
    if (!zone.value.trim()) {
      setSaving(true);
      try {
        const inferred = await lookup.inferNow();
        // Editing, closing or changing favorites cancels this save, even during lookup.
        if (attempt !== saveAttempt || !dialog.open) return;
        if (!inferred) {
          fail(zone, status.textContent!);
          zone.focus();
          return;
        }
      } finally {
        if (attempt === saveAttempt) setSaving(false);
      }
    }
    const site: Site = {
      name: name.value.trim() || 'Custom site',
      ...coordinates,
      tz: zone.value.trim(),
      ...(metres == null ? {} : { elevation: metres }),
    };
    if (!isSite(site)) {
      fail(zone, 'Enter a valid IANA time zone, such as America/Los_Angeles.');
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
