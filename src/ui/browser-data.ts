import Modal from 'bootstrap/js/dist/modal';
import { DEFAULT_SITES } from '../app/default-sites';
import {
  decodePersonalData,
  EditConflict,
  personal,
  STARTER_VERSION,
  type PersonalData,
} from '../app/personal-data';
import { el } from './dom';
import { useSavedPlan } from './share';
import { CACHE_BUDGET, nightCache } from '../app/night-cache';
import { downloadFile } from './download';

function download(contents: string, name: string): void {
  downloadFile(contents, name, 'application/json');
}

/** Deliberate, separately labeled controls for personal data; cache controls live alongside. */
export function initBrowserData(): void {
  const dialog = el('browserData');
  const modal = new Modal(dialog);
  const sites = Modal.getOrCreateInstance(el('sitePop'));
  const status = el('browserDataStatus');
  const file = el<HTMLInputElement>('dataFile');
  const review = el('dataReview');
  let imported: PersonalData | null = null;
  let baseRevision = 0;
  const refresh = () => {
    const data = personal.snapshot();
    el('dataSummary').textContent =
      `${data.sites.length} saved sites · format ${data.version} · revision ${data.revision}`;
    el<HTMLButtonElement>('dataBackup').disabled = !personal.stored(true);
    el<HTMLButtonElement>('dataStored').hidden = !personal.status() || !personal.stored();
  };
  const refreshCache = async () => {
    const info = await nightCache.info();
    el('dataCacheSummary').textContent = info
      ? `${info.months} cached site-months · approximately ${(info.bytes / 1024 / 1024).toFixed(1)} MiB of ${CACHE_BUDGET / 1024 / 1024} MiB. Calculations can be rebuilt.`
      : 'Calculation caching is unavailable. Nights are still computed on this device.';
  };
  el('browserDataOpen').addEventListener('click', () => {
    refresh();
    status.textContent = personal.status() ?? '';
    review.hidden = true;
    sites.hide();
    modal.show();
    void refreshCache();
  });
  for (const id of ['browserDataClose', 'browserDataDone'])
    el(id).addEventListener('click', () => modal.hide());
  dialog.addEventListener('hidden.bs.modal', () => {
    imported = null;
    sites.show();
    el('browserDataOpen').focus();
  });
  personal.subscribe(refresh);
  el('dataClearCache').addEventListener('click', async () => {
    const button = el<HTMLButtonElement>('dataClearCache');
    button.disabled = true;
    const cleared = await nightCache.clear();
    await refreshCache();
    status.textContent = cleared
      ? 'Computed cache cleared. Saved sites and preferences were kept.'
      : 'The cache could not be cleared. Saved sites and preferences were kept.';
    button.disabled = false;
  });
  el('dataExport').addEventListener('click', () =>
    download(JSON.stringify(personal.snapshot(), null, 2), 'night-planner-atlas-personal.json'),
  );
  el('dataBackup').addEventListener('click', () => {
    const raw = personal.stored(true);
    if (raw) download(raw, 'night-planner-atlas-previous.json');
  });
  el('dataStored').addEventListener('click', () => {
    const raw = personal.stored();
    if (raw) download(raw, 'night-planner-atlas-stored.json');
  });
  el('dataImport').addEventListener('click', () => {
    file.value = '';
    file.click();
  });
  file.addEventListener('change', async () => {
    imported = null;
    review.hidden = true;
    const selected = file.files?.[0];
    if (!selected) return;
    if (selected.size > 2 * 1024 * 1024) {
      status.textContent = 'Choose a personal-data JSON file smaller than 2 MiB.';
      return;
    }
    try {
      const decoded = decodePersonalData(await selected.text());
      if (!decoded.writable) throw new Error();
      imported = decoded.value;
      baseRevision = personal.snapshot().revision;
      el('dataImportSummary').textContent =
        `Replace saved data with ${imported.sites.length} sites and their saved preferences? The current saved document will be kept as the previous copy.`;
      review.hidden = false;
      status.textContent = '';
      el('dataConfirmImport').focus();
    } catch {
      status.textContent =
        'This file is damaged or uses an unsupported personal-data format. Saved data was left unchanged.';
    }
  });
  el('dataCancelImport').addEventListener('click', () => {
    imported = null;
    review.hidden = true;
  });
  el('dataConfirmImport').addEventListener('click', async () => {
    if (!imported) return;
    const replacement = structuredClone(imported);
    const result = await personal.update((draft) => {
      if (draft.revision !== baseRevision) throw new EditConflict();
      Object.assign(draft, replacement, { revision: draft.revision });
    }, true);
    status.textContent =
      result.message ??
      'Sites and preferences imported. The previous saved copy is available below.';
    if (!result.conflict) {
      review.hidden = true;
      imported = null;
      useSavedPlan();
    }
  });
  el('dataResetPreferences').addEventListener('click', async () => {
    const result = await personal.update((draft) => {
      draft.preferences = {};
    }, true);
    status.textContent = result.message ?? 'Preferences reset. Saved sites were kept.';
    useSavedPlan(true);
  });
  el('dataRestoreStarters').addEventListener('click', async () => {
    const result = await personal.update((draft) => {
      for (const site of DEFAULT_SITES)
        if (
          !draft.sites.some((s) => s.id === site.id || (s.lat === site.lat && s.lon === site.lon))
        )
          draft.sites.push({ ...site });
      draft.starterVersion = Math.max(draft.starterVersion, STARTER_VERSION);
    });
    status.textContent =
      result.message ?? 'Missing starter sites added. Existing sites and edits were kept.';
  });
}
