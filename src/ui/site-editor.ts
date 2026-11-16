import Modal from 'bootstrap/js/dist/modal';
import { personal, EditConflict, type PersonalData, type SaveResult } from '../app/personal-data';
import { insertSite, moveSite, siteRecord, type Favorite } from '../app/site-book';
import { applySite } from '../app/shell';
import { S } from '../app/state';
import type { Site } from '../model/night';
import { isSite, parseSiteInput, type Coordinates } from '../model/site-input';
import { el } from './dom';
import { bindSiteZone } from './site-zone';

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
const actionIcons = {
  edit: icon('<path d="m16 3 5 5-13 13H3v-5Z M13 6l5 5"/>'),
  duplicate: icon(
    '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  ),
  up: icon('<path d="M12 19V5m-6 6 6-6 6 6"/>'),
  down: icon('<path d="M12 5v14m-6-6 6 6 6-6"/>'),
  remove: icon('<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>'),
};
const currentIcon = icon('<path d="m5 12 4 4L19 6"/>');

/** List operations save independently; the form owns one isolated, conflict-checked draft. */
export function initSiteEditor(): void {
  const picker = el<HTMLSelectElement>('siteSel');
  const dialog = el('sitePop');
  const modal = new Modal(dialog, { backdrop: 'static' });
  const form = el<HTMLFormElement>('siteForm');
  const list = el('siteList');
  const body = dialog.querySelector<HTMLElement>('.modal-body')!;
  const scrollArea = () =>
    getComputedStyle(body).overflowY === 'visible'
      ? dialog.querySelector<HTMLElement>('.modal-content')!
      : body;
  let listScroll = 0;
  let choiceAttempt = 0;
  const name = el<HTMLInputElement>('siteName');
  const location = el<HTMLInputElement>('siteLocation');
  const elevation = el<HTMLInputElement>('siteElevation');
  const zone = el<HTMLInputElement>('siteTz');
  const status = el('siteZoneStatus');
  const save = el<HTMLButtonElement>('siteSave');
  const use = el<HTMLButtonElement>('siteApply');
  const errors = new Map<HTMLInputElement, HTMLElement>([
    [location, el('siteLocationErr')],
    [elevation, el('siteElevationErr')],
    [zone, el('siteTzErr')],
  ]);
  let book = personal.snapshot();
  let currentId: string | null = 'id' in book.active ? book.active.id : null;
  let editingBase: Favorite | null = null;
  let editingId: string | null = null;
  let duplicateSource: string | null = null;
  let point: Coordinates | null = null;
  let coordinateError = '';
  let saveAttempt = 0;
  let initialFields = '';
  let committing = false;
  let allowClose = false;
  let leave: (() => void) | null = null;
  let leaveFocus: HTMLElement | null = null;
  let editOpener: HTMLElement | null = null;
  let removing: Favorite | null = null;
  let removeOpener: HTMLElement | null = null;
  const rows = new Map<string, HTMLElement>();
  const fields = () => JSON.stringify([name.value, location.value, elevation.value, zone.value]);
  const dirty = () => !form.hidden && fields() !== initialFields;
  const matchesCurrent = (site: Site) =>
    JSON.stringify(siteRecord(site)) === JSON.stringify(siteRecord(S.site));
  const activeFavorite = () => {
    const active = book.active;
    return (
      book.sites.find((site) => site.id === currentId && matchesCurrent(site)) ??
      ('id' in active
        ? book.sites.find((site) => site.id === active.id && matchesCurrent(site))
        : undefined) ??
      book.sites.find(matchesCurrent)
    );
  };
  const coordinatesCaption = (site: Site) =>
    `${Math.abs(site.lat).toFixed(3)}°${site.lat >= 0 ? 'N' : 'S'} ${Math.abs(site.lon).toFixed(3)}°${site.lon >= 0 ? 'E' : 'W'}${site.elevation == null ? '' : ` · ${site.elevation} m`}`;
  const siteCaption = (site: Site) => `${site.name} · ${coordinatesCaption(site)} · ${site.tz}`;
  const focus = (target: HTMLElement | null) => {
    (target?.isConnected && target.getClientRects().length ? target : el('siteAdd')).focus();
  };
  const showResult = (result?: SaveResult) => {
    const message = result?.message ?? personal.status();
    el('siteStorageNotice').textContent = message ?? '';
    el('siteStorageNotice').hidden = !message;
    el('siteStorage').textContent =
      message ?? 'Sites stay in this browser. Backups are in More → Browser data.';
  };
  const checkDraft = (draft: PersonalData, base: Favorite | null) => {
    if (base && JSON.stringify(draft.sites.find((s) => s.id === base.id)) !== JSON.stringify(base))
      throw new EditConflict();
  };
  const lookup = bindSiteZone(
    () => point,
    zone,
    status,
    el<HTMLDataListElement>('siteZoneChoices'),
  );
  const setSaving = (finding: boolean) => {
    save.disabled = finding;
    use.disabled = finding;
    save.textContent = finding ? 'Finding time zone…' : 'Save changes';
  };
  const cancelSave = () => {
    saveAttempt++;
    lookup.cancel();
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
  const requestLeave = (action: () => void) => {
    if (committing) return;
    if (!dirty()) {
      action();
      return;
    }
    cancelSave();
    leave = action;
    leaveFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el('siteDiscard').hidden = false;
    el('siteKeepEditing').focus();
  };
  const finishEdit = () => {
    cancelSave();
    form.hidden = true;
    dialog.classList.remove('site-editing');
    scrollArea().scrollTop = listScroll;
    editingId = null;
    editingBase = null;
    duplicateSource = null;
    el('siteDiscard').hidden = true;
    leave = null;
  };
  const updateConflict = () => {
    const latest = book.sites.find((site) => site.id === editingId);
    const changed =
      !form.hidden &&
      editingBase !== null &&
      JSON.stringify(latest) !== JSON.stringify(editingBase);
    el('siteDraftConflict').hidden = !changed;
    el('siteReload').hidden = !latest;
    el('siteDraftMessage').textContent = latest
      ? 'This saved site changed since you opened it. Your draft is kept. Reload the saved site or keep your draft as a new site.'
      : 'This saved site was removed since you opened it. Your draft is kept. You can keep it as a new site.';
  };
  const fill = (
    site: Site | null,
    id: string | null,
    source: HTMLElement,
    afterId: string | null = null,
  ) => {
    cancelSave();
    if (form.hidden) listScroll = scrollArea().scrollTop;
    // A discard prompt may have remained open while another tab changed the target.
    const latest = id ? personal.snapshot().sites.find((favorite) => favorite.id === id) : null;
    if (id && !latest) {
      finishEdit();
      el('siteActionStatus').textContent =
        'That site was removed in another tab. The saved list is up to date.';
      focus(el('siteAdd'));
      return;
    }
    if (latest) site = latest;
    editOpener = source;
    editingId = id;
    editingBase = structuredClone(latest ?? null);
    duplicateSource = afterId;
    name.value = site?.name ?? '';
    location.value = site ? `${site.lat}, ${site.lon}` : '';
    elevation.value = site?.elevation == null ? '' : String(site.elevation);
    zone.value = site?.tz ?? '';
    point = site ? { lat: site.lat, lon: site.lon } : null;
    coordinateError = '';
    for (const field of errors.keys()) clearError(field);
    el('siteRemoval').hidden = true;
    el('siteDraftConflict').hidden = true;
    status.textContent = site
      ? 'Clear this field to find the zone from these coordinates when saving, or enter an IANA zone to override it.'
      : 'Leave blank to find the zone from your coordinates. You can enter an IANA zone to override it.';
    el('siteEditTarget').textContent = id ? `Editing ${site!.name}` : 'New site';
    initialFields = fields();
    form.hidden = false;
    dialog.classList.add('site-editing');
    preview();
    showResult();
    (site ? name : location).focus();
  };
  const refresh = () => {
    book = personal.snapshot();
    const active = activeFavorite();
    if (active) currentId = active.id;
    picker.replaceChildren();
    if (!active) picker.appendChild(new Option(`${S.site.name} (current, unsaved)`, 'current'));
    for (const site of book.sites) {
      const duplicateName = book.sites.some(
        (other) => other.id !== site.id && other.name === site.name,
      );
      picker.appendChild(
        new Option(duplicateName ? siteCaption(site) : site.name, `site:${site.id}`),
      );
    }
    picker.append(document.createElement('hr'), new Option('Manage sites…', 'manage'));
    picker.value = active ? `site:${active.id}` : 'current';
    picker.title = siteCaption(S.site);
    const focused = list.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : null;
    const ids = new Set(book.sites.map((site) => site.id));
    for (const [id, row] of rows)
      if (!ids.has(id)) {
        row.remove();
        rows.delete(id);
      }
    book.sites.forEach((site, index) => {
      let row = rows.get(site.id);
      if (!row) {
        row = document.createElement('li');
        row.className = 'site-row';
        row.dataset.siteId = site.id;
        row.innerHTML = `<div class="site-row-info"><strong class="site-row-name"></strong><span class="site-row-meta"></span></div>
          <div class="site-row-actions"><button type="button" class="btn btn-outline-secondary site-use" data-action="use">Use</button>${Object.entries(
            actionIcons,
          )
            .map(
              ([action, svg]) =>
                `<button type="button" class="btn btn-outline-secondary site-action" data-action="${action}">${svg}</button>`,
            )
            .join('')}</div>`;
        rows.set(site.id, row);
      }
      row.querySelector('.site-row-name')!.textContent = site.name;
      row.querySelector<HTMLElement>('.site-row-name')!.title = site.name;
      const metadata = `${coordinatesCaption(site)} · ${site.tz}`;
      const caption = row.querySelector<HTMLElement>('.site-row-meta')!;
      caption.textContent = caption.title = metadata;
      const current = site.id === active?.id;
      const useButton = row.querySelector<HTMLElement>('[data-action="use"]')!;
      useButton.innerHTML = current ? currentIcon : 'Use';
      useButton.setAttribute('aria-disabled', String(current));
      useButton.classList.toggle('site-current', current);
      for (const button of row.querySelectorAll<HTMLElement>('[data-action]')) {
        const action = button.dataset.action!;
        const label =
          action === 'use' && current
            ? `Currently using ${site.name}`
            : action === 'up' || action === 'down'
              ? `Move ${site.name} ${action}`
              : `${action === 'use' ? 'Use' : action[0].toUpperCase() + action.slice(1)} ${site.name}`;
        button.setAttribute('aria-label', label);
        button.title = label;
        if (action === 'up' || action === 'down')
          button.setAttribute(
            'aria-disabled',
            String(action === 'up' ? index === 0 : index === book.sites.length - 1),
          );
      }
      // Only move DOM nodes when order actually changes; preserve focused controls.
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
    });
    if (focused) focus(focused);
    el('siteEmpty').hidden = book.sites.length !== 0;
    el('siteUnsaved').hidden = !!active;
    el('siteUnsavedName').textContent =
      `Currently using ${S.site.name}. This site is not in your saved list.`;
    updateConflict();
  };
  const persist = async (edit: (draft: PersonalData) => void) => {
    const result = await personal.update(edit);
    refresh();
    showResult(result);
    return result;
  };
  const chooseSite = async (favorite: Favorite, close = false) => {
    const attempt = ++choiceAttempt;
    const result = await persist((draft) => {
      checkDraft(draft, favorite);
      draft.active = { id: favorite.id };
    });
    if (result.conflict || attempt !== choiceAttempt) return;
    currentId = favorite.id;
    applySite(siteRecord(favorite));
    if (close) {
      finishEdit();
      modal.hide();
    }
  };
  picker.addEventListener('change', () => {
    if (picker.value === 'manage') {
      refresh();
      finishEdit();
      el('siteActionStatus').textContent = '';
      el('siteRemoval').hidden = true;
      modal.show();
    } else {
      const favorite = book.sites.find((site) => `site:${site.id}` === picker.value);
      if (favorite) void chooseSite(favorite);
    }
  });
  window.addEventListener('npa-site-change', () => {
    choiceAttempt++;
    // Explicit site changes may select an otherwise identical saved record.
    const latest = personal.snapshot();
    currentId = 'id' in latest.active ? latest.active.id : null;
    refresh();
  });
  personal.subscribe(() => {
    refresh();
    showResult();
  });
  refresh();
  showResult();
  for (const id of ['siteDone', 'siteClose']) el(id).addEventListener('click', () => modal.hide());
  el('siteCancel').addEventListener('click', () =>
    requestLeave(() => {
      finishEdit();
      focus(editOpener);
    }),
  );
  el('siteKeepEditing').addEventListener('click', () => {
    leave = null;
    el('siteDiscard').hidden = true;
    focus(leaveFocus);
  });
  el('siteDiscardChanges').addEventListener('click', () => {
    const action = leave;
    leave = null;
    el('siteDiscard').hidden = true;
    action?.();
  });
  dialog.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && !el('siteDiscard').hidden) {
        event.stopImmediatePropagation();
        el('siteKeepEditing').click();
      } else if (event.key === 'Escape' && !el('siteRemoval').hidden) {
        event.stopImmediatePropagation();
        el('siteKeep').click();
      }
    },
    true,
  );
  dialog.addEventListener('shown.bs.modal', () => el('siteAdd').focus());
  dialog.addEventListener('hide.bs.modal', (event) => {
    if (committing) {
      event.preventDefault();
      return;
    }
    if (!allowClose && dirty()) {
      event.preventDefault();
      requestLeave(() => {
        allowClose = true;
        modal.hide();
      });
      return;
    }
    cancelSave();
  });
  dialog.addEventListener('hidden.bs.modal', () => {
    allowClose = false;
    finishEdit();
    picker.focus({ preventScroll: true });
  });
  el('siteAdd').addEventListener('click', () =>
    requestLeave(() => fill(null, null, el('siteAdd'))),
  );
  el('siteSaveCurrent').addEventListener('click', () =>
    requestLeave(() => fill(S.site, null, el('siteSaveCurrent'))),
  );
  el('siteReload').addEventListener('click', () =>
    requestLeave(() => {
      const latest = book.sites.find((site) => site.id === editingId);
      if (latest) fill(latest, latest.id, editOpener ?? el('siteAdd'));
    }),
  );
  el('siteDraftCopy').addEventListener('click', () => {
    cancelSave();
    editingId = null;
    editingBase = null;
    duplicateSource = null;
    el('siteEditTarget').textContent = 'New site';
    el('siteDraftConflict').hidden = true;
    name.focus();
  });
  list.addEventListener('click', async (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button || committing || button.getAttribute('aria-disabled') === 'true') return;
    const id = button.closest<HTMLElement>('[data-site-id]')!.dataset.siteId!;
    const favorite = book.sites.find((site) => site.id === id);
    if (!favorite) return;
    const action = button.dataset.action;
    if (action === 'edit') requestLeave(() => fill(favorite, id, button));
    else if (action === 'use')
      requestLeave(() => {
        void chooseSite(favorite, true);
      });
    else if (action === 'duplicate')
      requestLeave(() => {
        fill({ ...favorite, name: `${favorite.name} copy` }, null, button, id);
        name.select();
      });
    else if (action === 'remove') {
      const confirm = () => {
        removing = structuredClone(favorite);
        removeOpener = button;
        el('siteRemoveName').textContent = favorite.name;
        el('siteRemoval').hidden = false;
        el('siteKeep').focus();
      };
      if (editingId === id)
        requestLeave(() => {
          finishEdit();
          confirm();
        });
      else confirm();
    } else {
      const result = await persist((draft) => {
        if (!draft.sites.some((site) => site.id === id)) throw new EditConflict();
        moveSite(draft.sites, id, action === 'up' ? -1 : 1);
      });
      if (!result.conflict)
        el('siteActionStatus').textContent =
          `${favorite.name} moved to position ${book.sites.findIndex((site) => site.id === id) + 1} of ${book.sites.length}.${result.saved ? '' : ' This order applies only to this visit.'}`;
    }
  });
  el('siteKeep').addEventListener('click', () => {
    removing = null;
    el('siteRemoval').hidden = true;
    focus(removeOpener);
  });
  el('siteConfirmRemove').addEventListener('click', async () => {
    const base = removing;
    if (!base || committing) return;
    committing = true;
    const result = await persist((draft) => {
      checkDraft(draft, base);
      draft.sites = draft.sites.filter((site) => site.id !== base.id);
      if ('id' in draft.active && draft.active.id === base.id)
        draft.active = { site: siteRecord(base) };
    });
    committing = false;
    if (result.conflict) return;
    removing = null;
    el('siteRemoval').hidden = true;
    if (editingId === base.id) finishEdit();
    el('siteActionStatus').textContent =
      `${base.name} removed from ${result.saved ? 'saved sites' : 'this visit’s list'}. Your current plan stays open.`;
    focus(el('siteAdd'));
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
    // Do not cancel the coordinate field's newly scheduled inference here.
    saveAttempt++;
    setSaving(false);
    const field = event.target as HTMLInputElement;
    if (errors.has(field)) clearError(field);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (committing) return;
    const activate = event.submitter === use;
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
    const afterId = duplicateSource;
    const updatesCurrent = base !== null && activeFavorite()?.id === base.id;
    committing = true;
    save.disabled = use.disabled = true;
    const result = await persist((draft) => {
      if (attempt !== saveAttempt) throw new EditConflict();
      checkDraft(draft, base);
      if (base)
        draft.sites = draft.sites.map((favorite) =>
          favorite.id === id ? { ...site, id } : favorite,
        );
      else insertSite(draft.sites, { ...site, id }, afterId);
      if (activate) draft.active = { id };
    });
    committing = false;
    save.disabled = use.disabled = false;
    if (result.conflict) return;
    finishEdit();
    if (activate || updatesCurrent) {
      currentId = id;
      applySite(site);
    }
    el('siteActionStatus').textContent =
      `${site.name} ${result.saved ? 'saved' : 'kept for this visit'}.`;
    if (activate) modal.hide();
    else focus(rows.get(id)?.querySelector<HTMLElement>('[data-action="edit"]') ?? null);
  });
}
