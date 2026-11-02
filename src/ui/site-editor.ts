import Modal from 'bootstrap/js/dist/modal';
import { personal, EditConflict, type PersonalData, type SaveResult } from '../app/personal-data';
import { siteRecord, type Favorite } from '../app/site-book';
import { applySite } from '../app/shell';
import { S } from '../app/state';
import type { Site } from '../model/night';
import { isSite, parseSiteInput, type Coordinates } from '../model/site-input';
import { el } from './dom';
import { bindSiteZone } from './site-zone';

/** Pick saved sites directly; management edits stay in a draft until Save & use. */
export function initSiteEditor(): void {
  const picker = el<HTMLSelectElement>('siteSel');
  const dialog = el('sitePop');
  const modal = new Modal(dialog, { backdrop: 'static' });
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
  let book = personal.snapshot();
  let editingBase: Favorite | null = null;
  let editingId: string | null = null;
  let point: Coordinates | null = null;
  let coordinateError = '';
  let saveAttempt = 0;
  let opener: HTMLElement = picker;
  const matchesCurrent = (site: Site) =>
    JSON.stringify(siteRecord(site)) === JSON.stringify(siteRecord(S.site));
  const activeFavorite = () => {
    const active = book.active;
    return (
      ('id' in active
        ? book.sites.find((site) => site.id === active.id && matchesCurrent(site))
        : undefined) ?? book.sites.find(matchesCurrent)
    );
  };
  const siteCaption = (site: Site) =>
    `${site.name} · ${Math.abs(site.lat).toFixed(2)}°${site.lat >= 0 ? 'N' : 'S'} ${Math.abs(site.lon).toFixed(2)}°${site.lon >= 0 ? 'E' : 'W'}${site.elevation == null ? '' : ` · ${site.elevation} m`}`;
  const refreshPicker = () => {
    book = personal.snapshot();
    const active = activeFavorite();
    picker.replaceChildren();
    if (!active) picker.appendChild(new Option(S.site.name, 'current'));
    for (const site of book.sites) {
      const duplicateName = book.sites.some(
        (other) => other.id !== site.id && other.name === site.name,
      );
      picker.appendChild(
        new Option(duplicateName ? siteCaption(site) : site.name, `site:${site.id}`),
      );
    }
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
  const showResult = (result?: SaveResult) => {
    const message = result?.message ?? personal.status();
    el('siteStorageNotice').textContent = message ?? '';
    el('siteStorageNotice').hidden = !message;
    el('siteStorage').textContent =
      message ?? 'Favorites and preferences stay in this browser. No account is needed.';
  };
  const persist = async (edit: (draft: PersonalData) => void) => {
    const result = await personal.update(edit);
    showResult(result);
    refreshPicker();
    return result;
  };
  const checkDraft = (draft: PersonalData, base: Favorite | null) => {
    if (base && JSON.stringify(draft.sites.find((s) => s.id === base.id)) !== JSON.stringify(base))
      throw new EditConflict();
  };
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
    field.classList.remove('is-invalid');
  };
  const fail = (field: HTMLInputElement, message: string) => {
    const error = errors.get(field)!;
    error.textContent = message;
    error.hidden = false;
    field.setAttribute('aria-invalid', 'true');
    field.classList.add('is-invalid');
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
    editingBase = structuredClone(book.sites.find((site) => site.id === id) ?? null);
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
    showResult();
  };
  const openEditor = (source: HTMLElement) => {
    opener = source;
    refreshPicker();
    fill(S.site, activeFavorite()?.id ?? null);
    modal.show();
  };
  picker.addEventListener('change', async () => {
    if (picker.value === 'manage') {
      openEditor(picker);
      return;
    }
    const favorite = book.sites.find((site) => `site:${site.id}` === picker.value);
    if (!favorite) return;
    applySite(siteRecord(favorite));
    await persist((draft) => {
      checkDraft(draft, favorite);
      draft.active = { id: favorite.id };
    });
  });
  el('shareReviewSite').addEventListener('click', (event) =>
    openEditor(event.currentTarget as HTMLElement),
  );
  window.addEventListener('npa-site-change', refreshPicker);
  personal.subscribe(() => {
    refreshPicker();
    showResult();
  });
  showResult();
  refreshPicker();
  for (const id of ['siteCancel', 'siteClose'])
    el(id).addEventListener('click', () => modal.hide());
  dialog.addEventListener('shown.bs.modal', () => favorites.focus());
  dialog.addEventListener('hide.bs.modal', () => {
    lookup.cancel();
    cancelSave();
  });
  dialog.addEventListener('hidden.bs.modal', () => {
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
  el('siteConfirmRemove').addEventListener('click', async () => {
    const base = editingBase;
    if (!base) return;
    const result = await persist((draft) => {
      checkDraft(draft, base);
      draft.sites = draft.sites.filter((site) => site.id !== base.id);
      if ('id' in draft.active && draft.active.id === base.id)
        draft.active = { site: siteRecord(base) };
    });
    if (result.conflict) return;
    const next = book.sites[0];
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
        if (attempt !== saveAttempt || !dialog.classList.contains('show')) return;
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
    const base = editingBase;
    save.disabled = true;
    picker.disabled = true;
    const result = await persist((draft) => {
      checkDraft(draft, base);
      if (base)
        draft.sites = draft.sites.map((favorite) =>
          favorite.id === id ? { ...site, id } : favorite,
        );
      else draft.sites.push({ ...site, id });
      draft.active = { id };
    });
    save.disabled = false;
    picker.disabled = false;
    if (result.conflict) return;
    modal.hide();
    applySite(site);
  });
}
