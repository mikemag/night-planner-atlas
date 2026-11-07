import { C, inkOn } from '../render/colors';
import { el, scroller } from './dom';
import guide from './guide.html?raw';
import overview from './docs/overview.html?raw';
import faq from './docs/faq.html?raw';
import using from './docs/using.html?raw';
import calculations from './docs/calculations.html?raw';
import privacy from './docs/privacy.html?raw';
import licenses from './docs/licenses.html?raw';
import { initExamples, renderExamples } from './docs/examples';
import codeLicense from '../../LICENSE?raw';
import contentLicense from '/licenses/cc-by-sa-4.0.txt?raw';
import resultsLicense from '/licenses/cc0-1.0.txt?raw';
import astronomyNotices from '/licenses/astronomy-engine.txt?raw';
import timezoneNotices from '/licenses/timezone-notices.txt?raw';
import bootstrapNotices from '/licenses/bootstrap-notices.txt?raw';
import reference from '../model/testdata/usno.json';

const pages = { overview, faq, using, calculations, privacy, licenses };
export type DocsPage = keyof typeof pages;
const names: Record<DocsPage, string> = {
  overview: 'Overview',
  faq: 'FAQ',
  using: 'Using the planner',
  calculations: 'How it works',
  privacy: 'Privacy',
  licenses: 'Licenses and credits',
};
const legacy: Record<string, DocsPage> = {
  'reading-night': 'using',
  'planning-choices': 'using',
  'sites-and-time': 'using',
  'using-planner': 'using',
  accuracy: 'calculations',
  'privacy-credits': 'privacy',
};
let opened = false;
let plannerUrl = location.pathname;
let scroll = { top: 0, left: 0, page: 0 };
let resume = () => {};
let current: DocsPage = 'overview';
let opener: HTMLElement | null = null;
export const docsOpen = () => opened;
const phone = () => matchMedia('(max-width: 800px)').matches;

function route(): { page: DocsPage; anchor: string } | null {
  const key = new URLSearchParams(location.search).get('docs');
  const anchor = location.hash.slice(1);
  if (key) return { page: Object.hasOwn(pages, key) ? (key as DocsPage) : 'overview', anchor };
  return Object.hasOwn(legacy, anchor) ? { page: legacy[anchor], anchor } : null;
}
function url(page: DocsPage, anchor = ''): string {
  return `${location.pathname}?docs=${page}${anchor ? '#' + anchor : ''}`;
}
function show(page: DocsPage, anchor = '', focus = true): void {
  if (
    page === 'privacy' &&
    ['astronomyNotices', 'timezoneNotices', 'bootstrapNotices'].includes(anchor)
  )
    page = 'licenses';
  if (!opened) {
    scroll = { top: scroller.scrollTop, left: scroller.scrollLeft, page: window.scrollY };
    opener = document.activeElement as HTMLElement | null;
  }
  opened = true;
  current = page;
  el('app').classList.add('docs-open');
  window.scrollTo(0, 0);
  el('notesView').hidden = false;
  el('docsIdentity').hidden = false;
  el('docsCurrentPage').textContent = names[page];
  el('docsLink').setAttribute('aria-current', 'page');
  for (const node of document.querySelectorAll<HTMLElement>('[data-doc-page]'))
    node.hidden = node.dataset.docPage !== page;
  for (const node of document.querySelectorAll<HTMLElement>('[data-doc-nav]')) {
    if (node.dataset.docNav === page) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-doc-sections]'))
    node.hidden = node.dataset.docSections !== page;
  el<HTMLDetailsElement>('docsContents').open = !phone();
  document.title = `${names[page]} · Night Planner Atlas`;
  renderExamples();
  el('docsContent').scrollTop = 0;
  const target =
    (anchor
      ? document
          .querySelector<HTMLElement>(`[data-doc-page="${page}"]`)!
          .querySelector<HTMLElement>(`[id="${CSS.escape(anchor)}"]`)
      : null) ?? document.querySelector<HTMLElement>(`[data-doc-page="${page}"] h2`)!;
  // A deep link into a disclosure opens it before scrolling/focusing.
  const detail = target.closest('details');
  if (detail) detail.open = true;
  if (focus) {
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  if (anchor) target.scrollIntoView({ block: 'start' });
}
export function openDocs(page: DocsPage = 'overview', anchor = ''): void {
  if (!opened) plannerUrl = location.pathname + location.search + location.hash;
  history.pushState(null, '', url(page, anchor));
  show(page, anchor);
}
export function closeDocs(): void {
  if (!opened) return;
  history.pushState(null, '', plannerUrl);
  hide();
}
function hide(): void {
  if (!opened) return;
  opened = false;
  el('app').classList.remove('docs-open');
  el('notesView').hidden = true;
  el('docsIdentity').hidden = true;
  el('docsLink').removeAttribute('aria-current');
  document.title = 'Night Planner Atlas';
  scroller.scrollTop = scroll.top;
  scroller.scrollLeft = scroll.left;
  resume();
  window.scrollTo(0, scroll.page);
  (opener?.isConnected && opener.getClientRects().length ? opener : el('docsLink')).focus({
    preventScroll: true,
  });
}

/** Docs keep the planner mounted and never change its persisted view or settings. */
export function initGuide(onResume: () => void, oldNotes = false): void {
  resume = onResume;
  el('notesView').innerHTML = guide;
  for (const [key, content] of Object.entries(pages)) {
    const article = document.createElement('article');
    article.className = 'guide-page';
    article.dataset.docPage = key;
    article.hidden = true;
    article.innerHTML = content;
    for (const heading of article.querySelectorAll<HTMLElement>('section[id] > h3')) {
      const link = document.createElement('a');
      link.href = url(key as DocsPage, heading.parentElement!.id);
      link.textContent = heading.textContent;
      heading.replaceChildren(link);
    }
    el('docsContent').append(article);
  }
  el('astronomyNotices').textContent = astronomyNotices;
  el('timezoneNotices').textContent = timezoneNotices;
  el('bootstrapNotices').textContent = bootstrapNotices;
  el('codeLicenseText').textContent = codeLicense;
  el('contentLicenseText').textContent = contentLicense;
  el('resultsLicenseText').textContent = resultsLicense;
  for (const source of reference.sources) {
    const item = document.createElement('li'),
      link = document.createElement('a');
    link.href = source.url;
    link.textContent = `${source.site} · ${source.table}`;
    item.append(link);
    el('referenceQueries').append(item);
  }
  el<HTMLAnchorElement>('referenceFixture').href = URL.createObjectURL(
    new Blob([JSON.stringify(reference, null, 2)], { type: 'application/json' }),
  );
  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link || link.target === '_blank') return;
    const dest = new URL(link.href);
    if (dest.origin !== location.origin || dest.pathname !== location.pathname) return;
    const key = dest.searchParams.get('docs');
    if (!key || !Object.hasOwn(pages, key)) return;
    event.preventDefault();
    openDocs(key as DocsPage, dest.hash.slice(1));
  });
  el('docsBack').addEventListener('click', (event) => {
    event.preventDefault();
    closeDocs();
  });
  window.addEventListener('popstate', () => {
    const dest = route();
    if (dest) show(dest.page, dest.anchor);
    else hide();
  });
  matchMedia('(max-width: 800px)').addEventListener('change', () => {
    el<HTMLDetailsElement>('docsContents').open = !phone();
  });
  initExamples();
  updateGuideColors();
  const dest = route();
  if (dest) show(dest.page, dest.anchor, false);
  else if (oldNotes) {
    history.replaceState(null, '', url('overview'));
    show('overview', '', false);
  }
}

export function updateGuideColors(): void {
  for (const node of document.querySelectorAll<HTMLElement>('[data-sky-stage]')) {
    const color = C[node.dataset.skyStage as 'day' | 'civil' | 'naut' | 'astro' | 'dark'];
    node.style.background = color;
    node.style.color = inkOn(color);
  }
  if (opened && current === 'using') renderExamples();
}
