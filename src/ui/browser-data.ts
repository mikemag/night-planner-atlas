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
import { closeAppMenu } from './app-menu';
import type { SiteManager } from './site-editor';

function download(contents: string, name: string): void {
  downloadFile(contents, name, 'application/json');
}

/** Deliberate, separately labeled controls for personal data; cache controls live alongside. */
export function initBrowserData(sites: SiteManager): void {
  const dialog = el('browserData');
  const modal = new Modal(dialog);
  const status = el('browserDataStatus');
  const file = el<HTMLInputElement>('dataFile');
  const review = el('dataReview');
  let imported: PersonalData | null = null;
  let baseDocument = '';
  let fromSites = false;
  let fileAttempt = 0;
  let replacing = false;
  const refresh = () => {
    const data = personal.snapshot();
    el('dataSummary').textContent = `${data.sites.length} sites in the current list.`;
    const temporary = personal.status();
    el('dataTemporary').hidden = !temporary;
    el('dataTemporary').textContent = temporary
      ? `${temporary} Export downloads the current list and preferences, including temporary changes. An open site-edit draft is not included.`
      : '';
    const recovery = personal.stored(true);
    el<HTMLButtonElement>('dataBackup').disabled = !recovery;
    el('dataRecoveryStatus').textContent =
      recovery === undefined
        ? 'Recovery storage is unavailable in this browser.'
        : recovery === null
          ? 'No recovery copy exists yet.'
          : 'A recovery copy is available to download. It stays only in this browser until you download it.';
    el<HTMLButtonElement>('dataStored').hidden = !personal.status() || !personal.stored();
  };
  const refreshCache = async () => {
    const info = await nightCache.info();
    el('dataCacheSummary').textContent = info
      ? `${info.months} cached site-months · approximately ${(info.bytes / 1024 / 1024).toFixed(1)} MiB of ${CACHE_BUDGET / 1024 / 1024} MiB. Calculations can be rebuilt.`
      : 'Calculation caching is unavailable. Nights are still computed on this device.';
  };
  const open = (manager: boolean) => {
    fromSites = manager;
    refresh();
    imported = null;
    fileAttempt++;
    status.textContent = personal.status() ?? '';
    review.hidden = true;
    el('browserDataDone').textContent = manager ? 'Back to sites' : 'Done';
    if (manager) sites.suspend(() => modal.show());
    else {
      closeAppMenu();
      modal.show();
    }
    void refreshCache();
  };
  el('browserDataOpen').addEventListener('click', () => open(false));
  el('siteImport').addEventListener('click', () => open(true));
  for (const id of ['browserDataClose', 'browserDataDone'])
    el(id).addEventListener('click', () => modal.hide());
  dialog.addEventListener('shown.bs.modal', () =>
    el(fromSites ? 'dataImport' : 'dataExport').focus(),
  );
  dialog.addEventListener('hide.bs.modal', (event) => {
    if (replacing) event.preventDefault();
  });
  dialog.addEventListener('hidden.bs.modal', () => {
    imported = null;
    fileAttempt++;
    if (fromSites) sites.resume(el('siteImport'));
    else el('moreBtn').focus({ preventScroll: true });
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
  const exportCurrent = () =>
    download(JSON.stringify(personal.snapshot(), null, 2), 'night-planner-atlas-personal.json');
  el('dataExport').addEventListener('click', exportCurrent);
  el('siteExport').addEventListener('click', () => {
    exportCurrent();
    el('siteActionStatus').textContent =
      'Exported the current list, order and preferences. An open site-edit draft is not included.';
  });
  el('dataBackup').addEventListener('click', () => {
    const raw = personal.stored(true);
    if (raw) download(raw, 'night-planner-atlas-recovery.json');
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
    const attempt = ++fileAttempt;
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
      if (attempt !== fileAttempt) return;
      if (!decoded.writable) throw new Error();
      imported = decoded.value;
      baseDocument = JSON.stringify(personal.snapshot());
      el('dataImportSummary').textContent =
        `Replace all current saved sites with ${imported.sites.length} ${imported.sites.length === 1 ? 'site' : 'sites'}, in the file’s order, and replace the saved selection and preferences? Any existing saved document will be kept as the recovery copy. This replaces the current list; it does not add to it.`;
      review.hidden = false;
      status.textContent = '';
      el('dataConfirmImport').focus();
    } catch {
      if (attempt !== fileAttempt) return;
      status.textContent =
        'This file is damaged or uses an unsupported personal-data format. Saved data was left unchanged.';
    }
  });
  el('dataCancelImport').addEventListener('click', () => {
    fileAttempt++;
    imported = null;
    review.hidden = true;
    el('dataImport').focus();
  });
  el('dataConfirmImport').addEventListener('click', async () => {
    if (!imported || replacing) return;
    replacing = true;
    const replacement = structuredClone(imported);
    const result = await personal.update((draft) => {
      if (JSON.stringify(draft) !== baseDocument) throw new EditConflict();
      Object.assign(draft, replacement, { revision: draft.revision });
    }, true);
    replacing = false;
    status.textContent =
      result.message ??
      'Sites, order and preferences imported. See Recovery copy below for available recovery data.';
    if (!result.conflict) {
      review.hidden = true;
      imported = null;
      useSavedPlan();
      el('dataImport').focus();
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
