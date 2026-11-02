import Modal from 'bootstrap/js/dist/modal';
import { createShareLink, readSharedPlan, type SharedPlan } from '../app/share-state';
import { hasFocusPreference, loadSettings } from '../app/settings';
import { savePreferences } from '../app/personal-data';
import { restart, siteLabel, syncSettingsControls } from '../app/shell';
import { S, activeFocus, data } from '../app/state';
import { nightTitle, pad2 } from '../model/format';
import { siteRecord } from '../app/site-book';
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

/** Run after controls capture the recipient's saved site book, and before the first computation. */
export function initSharing(): void {
  const notice = el('sharedNotice');
  const message = el('sharedNoticeText');
  let included = false;
  const applyIncoming = () => {
    try {
      const plan = readSharedPlan(location.hash);
      if (plan) {
        const [y, m] = plan.start.split('-').map(Number);
        Object.assign(S, {
          view: plan.view,
          focus: plan.focus,
          moonAlt: plan.moonAlt,
          crescent: plan.crescent,
          calOrient: plan.calOrient,
          calZoom: plan.calZoom,
          riverZoom: plan.riverZoom,
          site: plan.site ?? loadSettings().site,
          rangeStart: { y, m },
          rangeShift: 0,
          pendingNight: plan.night,
          riverExpanded: plan.view === 'river' && plan.expanded,
          lunationsExpanded: plan.view === 'lunations' && plan.expanded,
          calendarExpanded: plan.view === 'calendar' && plan.expanded,
          calendarWeek: null,
          calendarMonth: plan.night?.slice(0, 7) ?? null,
          sharedSettings: true,
        });
        included = !!plan.site;
        message.textContent =
          'Shared view settings are temporary; your saved preferences and favorites are unchanged. ' +
          (included
            ? 'This link includes a site. Keeping it is a separate action in the site selector.'
            : 'This link uses your own site, so your results may differ from the sender’s.');
        notice.hidden = false;
        el('shareKeepSettings').hidden = false;
        el('shareReviewSite').hidden = !included;
        return true;
      }
    } catch (error) {
      message.textContent = (error as Error).message;
      notice.hidden = false;
      el('shareKeepSettings').hidden = true;
      el('shareReviewSite').hidden = true;
    }
    return false;
  };
  applyIncoming();
  el('shareKeepSettings').addEventListener('click', async () => {
    const patch = Object.fromEntries(preferenceKeys.map((key) => [key, S[key]]));
    const result = await savePreferences(patch);
    if (result.saved) {
      S.sharedSettings = false;
      S.focusExplicit = true;
      message.textContent =
        'View settings saved in this browser. ' +
        (included
          ? 'Saving the included site is a separate action in the site selector.'
          : 'Your own site remains selected.');
      el('shareKeepSettings').hidden = true;
    } else
      message.textContent = 'Browser storage is unavailable; these view settings remain temporary.';
  });
  el('shareRestore').addEventListener('click', () => {
    useSavedPlan();
  });
  // Apply same-document incoming links without a reload, including after going offline.
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#npa=') && applyIncoming()) {
      syncSettingsControls();
      siteLabel();
      restart();
    }
  });

  const dialog = el('shareDialog');
  const modal = new Modal(dialog);
  const include = el<HTMLInputElement>('shareIncludeSite');
  const link = el<HTMLTextAreaElement>('shareLink');
  const status = el('shareStatus');
  const copy = el<HTMLButtonElement>('shareCopy');
  const update = () => {
    const r = data.range;
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
      night: r.nights[S.sel]?.id ?? null,
      expanded:
        S.view === 'lunations'
          ? S.lunationsExpanded
          : S.view === 'calendar'
            ? S.calZoom !== 'year' && S.calendarExpanded
            : S.view === 'river' && S.riverZoom === 'month' && S.riverExpanded,
      ...(include.checked ? { site: siteRecord(S.site) } : {}),
    };
    el('shareSitePreview').hidden = !include.checked;
    status.textContent = '';
    try {
      link.value = createShareLink(location.href, plan);
      copy.disabled = false;
    } catch {
      link.value = '';
      copy.disabled = true;
      status.textContent =
        'This plan cannot be represented in a share link. Check the site name and loaded date range.';
    }
  };
  el('shareBtn').addEventListener('click', () => {
    closeAppMenu();
    if (!data.ready || !data.range) return;
    include.checked = false;
    const night = data.range.nights[S.sel];
    el('shareContext').textContent =
      `${el('viewTitle').textContent} · ${el('rangeLabel').textContent}${night ? ` · ${nightTitle(night)}` : ''}`;
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
  });
  include.addEventListener('change', update);
  for (const id of ['shareClose', 'shareCancel'])
    el(id).addEventListener('click', () => modal.hide());
  dialog.addEventListener('shown.bs.modal', () => include.focus());
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
}
