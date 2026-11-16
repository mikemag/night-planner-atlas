import Modal from 'bootstrap/js/dist/modal';
import { select } from '../app/shell';
import { S, data } from '../app/state';
import { noUsableDarkReason, phaseName } from '../model/describe';
import { fmtDur, SUN_NAMES } from '../model/format';
import { solarCrossings, SUN_EVENTS, type Interval } from '../model/night';
import { closeAppMenu } from './app-menu';
import { el } from './dom';

/** Native controls and structured facts for the selected chart night, including touch readers. */
export function initNightReader(): void {
  const dialog = el('nightReader');
  const modal = new Modal(dialog);
  const date = el<HTMLInputElement>('nightReaderDate');
  const previous = el<HTMLButtonElement>('nightReaderPrevious');
  const next = el<HTMLButtonElement>('nightReaderNext');
  let opener: HTMLElement = el('readNight');

  const render = () => {
    const range = data.range;
    const n = range?.nights[S.sel];
    if (!range || !n || !data.ready) return;
    date.min = range.nights[0].id;
    date.max = range.nights.at(-1)!.id;
    date.value = n.id;
    previous.setAttribute('aria-disabled', String(S.sel === 0));
    next.setAttribute('aria-disabled', String(S.sel === range.nights.length - 1));
    const day = new Intl.DateTimeFormat('en-US', {
      timeZone: n.tz.name,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: n.tz.name,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      ...(n.dst ? { timeZoneName: 'shortOffset' as const } : {}),
    });
    const clock = (instant: number) => time.format(Math.round(instant / 60_000) * 60_000);
    const windows = (values: Interval[]) =>
      values.length
        ? values.map(([a, b]) => `${clock(a)} to ${clock(b)} (${fmtDur(b - a)} elapsed)`).join('; ')
        : 'None during this observing night.';
    el('nightReaderSite').textContent =
      `${S.site.name} · ${n.tz.name}. Times use this site's local clock. The evening date includes the following morning.`;
    el('nightReaderStatus').textContent = `${day.format(n.noon)}. ${fmtDur(n.mfMs)} usable dark.`;
    // Headings support direct screen-reader navigation without description-list position chatter.
    const facts = document.createDocumentFragment();
    const add = (name: string, value: string) => {
      const heading = document.createElement('h3');
      heading.textContent = name;
      const description = document.createElement('p');
      description.textContent = value;
      facts.append(heading, description);
    };
    add('Usable dark', n.mf.length ? windows(n.mf) : noUsableDarkReason(n));
    add('Astronomical darkness', `${fmtDur(n.tdMs)}. ${windows(n.sunBelow.astronomical)}`);
    add('Moon at local midnight', `${Math.round(n.illum * 100)}% illuminated. ${phaseName(n)}.`);
    add(
      'Moon settings',
      `${S.moonAlt === 0 ? 'Moon below the horizon' : `Moon below ${S.moonAlt}° accepted`}. ${S.crescent ? `Ignore a Moon under ${Math.round(S.crescent * 100)}% illuminated.` : 'No crescent exception.'}${n.moonIgnored ? ' The Moon is ignored for this night.' : ''}`,
    );
    if (n.dst)
      add(
        'Clock change',
        'The UTC offset changes during this night. Each time includes its offset; durations measure elapsed time.',
      );
    const events = solarCrossings(n);
    for (const [i, event] of SUN_EVENTS.entries()) {
      const values = events.filter((e) => e.event === event).map((e) => clock(e.t));
      add(
        SUN_NAMES[i].replace('Astro', 'Astronomical'),
        values.length ? values.join('; ') : 'No crossing during this observing night.',
      );
    }
    for (const rising of [true, false]) {
      const values = n.moonWindows[0].crossings
        .filter((e) => e.rising === rising)
        .map((e) => clock(e.t));
      add(
        rising ? 'Moonrise' : 'Moonset',
        values.length ? values.join('; ') : 'No crossing in the calculated night span.',
      );
    }
    add(
      'Moon-event coverage',
      'Moon events cover the calculated night span, which may omit daylight hours.',
    );
    el('nightReaderFacts').replaceChildren(facts);
  };
  const open = (fromMenu: boolean) => {
    if (!data.ready) return;
    opener = el(fromMenu ? 'moreBtn' : 'readNight');
    if (fromMenu) closeAppMenu();
    render();
    // The dialog has its own concise announcement; the underlying chart stays quiet.
    el('riverSelection').setAttribute('aria-live', 'off');
    modal.show();
  };
  el('readNight').addEventListener('click', () => open(false));
  el('readNightMenu').addEventListener('click', () => open(true));
  el('nightReaderDone').addEventListener('click', () => modal.hide());
  dialog.addEventListener('shown.bs.modal', () => el('nightReaderTitle').focus());
  dialog.addEventListener('hidden.bs.modal', () => {
    el('riverSelection').setAttribute('aria-live', 'polite');
    opener.focus({ preventScroll: true });
  });
  const choose = (i: number) => {
    if (!data.ready || !data.range || i < 0 || i >= data.range.nights.length) return;
    select(i, true);
    render();
  };
  previous.addEventListener('click', () => choose(S.sel - 1));
  next.addEventListener('click', () => choose(S.sel + 1));
  el('nightReaderForm').addEventListener('submit', (event) => {
    event.preventDefault();
    choose(data.range?.nights.findIndex((n) => n.id === date.value) ?? -1);
  });
  const ready = () => {
    for (const id of ['readNight', 'readNightMenu'])
      el<HTMLButtonElement>(id).disabled = !data.ready;
    if (dialog.classList.contains('show')) render();
  };
  window.addEventListener('npa-ready', ready);
  window.addEventListener('npa-loading', ready);
  ready();
}
