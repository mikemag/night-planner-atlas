import Modal from 'bootstrap/js/dist/modal';
import {
  createShareLink,
  createSiteLink,
  readSharedLink,
  type SharedPlan,
} from '../app/share-state';
import { hasFocusPreference, loadSettings } from '../app/settings';
import { EditConflict, personal } from '../app/personal-data';
import { restart, siteLabel, syncSettingsControls } from '../app/shell';
import { S, activeFocus, data } from '../app/state';
import { nightTitle, pad2 } from '../model/format';
import {
  keepSharedSite,
  findSharedSite,
  sameLocation,
  siteRecord,
  undoSharedSite,
  type AddedSite,
} from '../app/site-book';
import type { Site } from '../model/night';
import { applyTheme, loadTheme } from '../app/theme';
import { closeAppMenu } from './app-menu';
import { el } from './dom';

const preferenceKeys = [
  'view',
  'focus',
  'moonAlt',
  'crescent',
  'calOrient',
  'calZoom',
  'riverZoom',
] as const;

/** Apply an explicit restore/import/reset without reloading or depending on the network. */
export function useSavedPlan(keepSite = false): void {
  Object.assign(S, loadSettings(), {
    ...(keepSite ? { site: S.site } : {}),
    sharedSettings: false,
    rangeStart: null,
    rangeShift: 0,
    pendingNight: null,
    riverExpanded: false,
    lunationsExpanded: false,
    calendarExpanded: false,
    calendarWeek: null,
    calendarMonth: null,
    focusExplicit: hasFocusPreference(),
  });
  history.replaceState(null, '', location.pathname + location.search);
  el('sharedNotice').hidden = true;
  applyTheme(loadTheme());
  syncSettingsControls();
  siteLabel();
  restart();
}

/** Receive links before the first computation; later links use the same locked storage edits. */
export async function initSharing(): Promise<void> {
  const notice = el('sharedNotice');
  const message = el('sharedNoticeText');
  const action = el<HTMLButtonElement>('shareAction');
  let noticeAction: (() => Promise<void>) | null = null;
  let timeout = 0;
  let receiveToken = 0;
  let incomingHash = '';
  const hideNotice = () => {
    window.clearTimeout(timeout);
    if (notice.contains(document.activeElement)) el('siteSel').focus({ preventScroll: true });
    notice.hidden = true;
    noticeAction = null;
  };
  const expireNotice = () => {
    timeout = window.setTimeout(() => {
      if (notice.matches(':focus-within, :hover')) expireNotice();
      else hideNotice();
    }, 12_000);
  };
  const showNotice = (
    text: string,
    label = '',
    run: (() => Promise<void>) | null = null,
    brief = false,
  ) => {
    window.clearTimeout(timeout);
    message.textContent = text;
    action.textContent = label;
    action.hidden = !run;
    action.disabled = false;
    noticeAction = run;
    notice.hidden = false;
    if (brief) expireNotice();
  };
  action.addEventListener('click', async () => {
    const run = noticeAction;
    if (!run) return;
    const token = receiveToken;
    const focused = document.activeElement === action;
    window.clearTimeout(timeout);
    action.disabled = true;
    try {
      await run();
    } catch {
      if (noticeAction === run)
        showNotice('This change could not be saved. Try again from Manage sites.');
    }
    if (focused && token === receiveToken) {
      if (notice.hidden) el('siteSel').focus({ preventScroll: true });
      else if (action.hidden) el('shareDismiss').focus({ preventScroll: true });
      else action.focus({ preventScroll: true });
    }
  });
  el('shareDismiss').addEventListener('click', hideNotice);
  el('siteSel').addEventListener('change', () => {
    receiveToken++;
    hideNotice();
  });

  const offerUndo = (added: AddedSite, token: number) => {
    const undo = async () => {
      const result = await personal.update((draft) => {
        if (token !== receiveToken || !undoSharedSite(draft, added)) throw new EditConflict();
      });
      if (token !== receiveToken) return;
      siteLabel();
      if (noticeAction !== undo) return;
      showNotice(
        result.conflict
          ? 'Saved sites have changed. Your current saved data was kept.'
          : result.saved
            ? 'Site removed from saved sites. You can keep using it for this visit.'
            : 'The saved copy could not be updated. Changes apply only to this visit.',
        '',
        null,
        true,
      );
    };
    showNotice(`${added.site.name} added to your sites.`, 'Undo', undo, true);
  };
  const saveSite = async (site: Site, token: number, announce = () => true) => {
    let kept: ReturnType<typeof keepSharedSite> | undefined;
    const result = await personal.update((draft) => {
      if (token !== receiveToken) throw new EditConflict();
      kept = keepSharedSite(draft, site);
    });
    if (token !== receiveToken || !kept) return null;
    if (!announce()) return { site: siteRecord(kept.site), saved: result.saved };
    if (!result.saved)
      showNotice(`Using ${kept.site.name} for this visit. Browser storage is unavailable.`);
    else if (kept.added) offerUndo(kept.added, token);
    else hideNotice();
    return { site: siteRecord(kept.site), saved: result.saved };
  };

  const applyIncoming = async (): Promise<boolean> => {
    const token = ++receiveToken;
    incomingHash = location.hash;
    hideNotice();
    try {
      const shared = readSharedLink(incomingHash);
      if (!shared) return false;
      if (shared.v === 2) {
        const saved = await saveSite(shared.site, token);
        if (!saved || token !== receiveToken) return false;
        const settings = loadSettings();
        Object.assign(S, settings, {
          view: settings.view === 'notes' ? 'river' : settings.view,
          site: saved.site,
          sharedSettings: false,
          rangeStart: null,
          rangeShift: 0,
          pendingNight: null,
          riverExpanded: false,
          lunationsExpanded: false,
          calendarExpanded: false,
          calendarWeek: null,
          calendarMonth: null,
          sel: -1,
          focusExplicit: hasFocusPreference(),
        });
        // A saved invitation becomes an ordinary visit. Reload must not import it again after Undo.
        if (saved.saved) {
          history.replaceState(history.state, '', location.pathname + location.search);
          incomingHash = '';
        }
        return true;
      }
      const plan = shared;
      let site = plan.site ?? S.site;
      if (!plan.preview) {
        const patch = Object.fromEntries(preferenceKeys.map((key) => [key, plan[key]]));
        await personal.update((draft) => {
          if (token !== receiveToken) throw new EditConflict();
          Object.assign(draft.preferences, patch);
          const favorite = findSharedSite(draft.sites, site);
          if (
            favorite &&
            favorite.tz === site.tz &&
            (favorite.elevation ?? 0) === (site.elevation ?? 0)
          ) {
            site = siteRecord(favorite);
            draft.active = { id: favorite.id };
          }
        });
      }
      if (token !== receiveToken) return false;
      const [y, m] = plan.start.split('-').map(Number);
      Object.assign(S, {
        view: plan.view,
        focus: plan.focus,
        moonAlt: plan.moonAlt,
        crescent: plan.crescent,
        calOrient: plan.calOrient,
        calZoom: plan.calZoom,
        riverZoom: plan.riverZoom,
        site,
        rangeStart: { y, m },
        rangeShift: 0,
        pendingNight: plan.night,
        riverExpanded: plan.view === 'river' && plan.expanded,
        lunationsExpanded: plan.view === 'lunations' && plan.expanded,
        calendarExpanded: plan.view === 'calendar' && plan.expanded,
        calendarWeek: null,
        calendarMonth: plan.night?.slice(0, 7) ?? null,
        sharedSettings: plan.preview === true,
        focusExplicit: true,
      });
      if (
        plan.site &&
        !plan.preview &&
        !personal.snapshot().sites.some((favorite) => sameLocation(favorite, site))
      ) {
        const save = async () => {
          const saved = await saveSite(site, token, () => noticeAction === save);
          if (!saved || token !== receiveToken) return;
          S.site = saved.site;
          siteLabel();
          restart();
        };
        showNotice(`Save ${site.name} for later?`, 'Save site', save);
      }
      return true;
    } catch (error) {
      if (token === receiveToken) showNotice((error as Error).message);
      return false;
    }
  };
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#npa=') || location.hash === incomingHash) return;
    void applyIncoming().then((changed) => {
      if (!changed) return;
      syncSettingsControls();
      siteLabel();
      restart();
    });
  });

  const dialog = el('shareDialog');
  const modal = new Modal(dialog);
  const include = el<HTMLInputElement>('shareIncludeSite');
  const link = el<HTMLTextAreaElement>('shareLink');
  const status = el('shareStatus');
  const copy = el<HTMLButtonElement>('shareCopy');
  let mode: 'site' | 'plan' = 'plan';
  const update = () => {
    const r = data.range;
    el('shareSitePreview').hidden = mode === 'plan' && !include.checked;
    status.textContent = '';
    try {
      if (mode === 'site') link.value = createSiteLink(location.href, S.site);
      else {
        if (!data.ready || !r) return;
        const plan: SharedPlan = {
          v: 1,
          start: `${r.spec.y}-${pad2(r.spec.m)}`,
          view: S.view,
          riverZoom: S.riverZoom,
          calZoom: S.calZoom,
          calOrient: S.calOrient,
          focus: activeFocus(),
          moonAlt: S.moonAlt,
          crescent: S.crescent,
          night: S.view === 'weekends' ? null : (r.nights[S.sel]?.id ?? null),
          expanded:
            S.view === 'lunations'
              ? S.lunationsExpanded
              : S.view === 'calendar'
                ? S.calZoom !== 'year' && S.calendarExpanded
                : S.view === 'river' && S.riverZoom === 'month' && S.riverExpanded,
          ...(include.checked ? { site: siteRecord(S.site) } : {}),
        };
        link.value = createShareLink(location.href, plan);
      }
      copy.disabled = false;
    } catch {
      link.value = '';
      copy.disabled = true;
      status.textContent = 'This link could not be created. Check the site and loaded dates.';
    }
  };
  const openSharing = (kind: typeof mode) => {
    closeAppMenu();
    if (kind === 'plan' && (!data.ready || !data.range)) return;
    mode = kind;
    include.checked = false;
    el('shareTitle').textContent = mode === 'site' ? 'Share site' : 'Share plan';
    el('shareDescription').textContent =
      mode === 'site'
        ? 'Open this site around today. New sites are saved in the recipient’s browser, with Undo.'
        : 'Open these dates, view, and Moon settings. Include the site if you want others to use this location.';
    el('shareIncludeSiteChoice').hidden = mode === 'site';
    el('shareSiteBehavior').textContent =
      mode === 'site'
        ? 'Existing saved sites are reused.'
        : 'A new site is saved only when the recipient chooses Save site.';
    const night = S.view === 'weekends' ? null : data.range?.nights[S.sel];
    el('shareContext').textContent =
      mode === 'site'
        ? S.site.name
        : `${el('viewTitle').textContent} · ${el('rangeLabel').textContent}${night ? ` · ${nightTitle(night)}` : ''}`;
    const preview = el('shareSiteFields');
    preview.replaceChildren();
    const fields = [
      ['Name', S.site.name],
      ['Latitude', String(S.site.lat)],
      ['Longitude', String(S.site.lon)],
      ['Time zone', S.site.tz],
    ];
    if (S.site.elevation != null) fields.push(['Elevation (metres)', String(S.site.elevation)]);
    for (const [name, value] of fields) {
      const term = document.createElement('dt'),
        definition = document.createElement('dd');
      term.textContent = name;
      definition.textContent = value;
      preview.append(term, definition);
    }
    update();
    modal.show();
  };
  el('shareBtn').addEventListener('click', () => openSharing('plan'));
  el('shareSiteBtn').addEventListener('click', () => openSharing('site'));
  include.addEventListener('change', update);
  for (const id of ['shareClose', 'shareCancel'])
    el(id).addEventListener('click', () => modal.hide());
  dialog.addEventListener('shown.bs.modal', () => (mode === 'site' ? copy : include).focus());
  dialog.addEventListener('hidden.bs.modal', () => el('moreBtn').focus({ preventScroll: true }));
  el('shareForm').addEventListener('submit', (event) => {
    event.preventDefault();
    void navigator.clipboard
      ?.writeText(link.value)
      .then(() => {
        status.textContent = 'Link copied.';
      })
      .catch(() => {
        link.focus();
        link.select();
        status.textContent =
          'Copy is unavailable. The link is selected; use your device’s Copy command.';
      });
    if (!navigator.clipboard) {
      link.focus();
      link.select();
      status.textContent =
        'Copy is unavailable. The link is selected; use your device’s Copy command.';
    }
  });
  await applyIncoming();
}
