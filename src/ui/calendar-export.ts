import Modal from 'bootstrap/js/dist/modal';
import {
  calendarEventDescriptions,
  calendarKinds,
  makeCalendarRecords,
  moonSettingsText,
  selectCalendarEvents,
  type CalendarEvent,
} from '../app/calendar-export';
import { addCalendarDays, serializeCalendar } from '../app/ical';
import { data, S } from '../app/state';
import type { Thresholds } from '../model/night';
import { tonightId, type NightRange } from '../model/range';
import { closeAppMenu } from './app-menu';
import { el } from './dom';
import { downloadFile } from './download';

const eventLabels = { moons: 'New moon', weekends: 'Best dark weekend', nights: 'Observing night' };
const dateLabel = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function paragraphs(target: HTMLElement, lines: string[]): void {
  target.replaceChildren(
    ...lines.map((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      return p;
    }),
  );
}

export function initCalendarExport(): void {
  const dialog = el('calendarExport');
  const modal = new Modal(dialog);
  const form = el<HTMLFormElement>('calendarExportForm');
  const editor = el('calendarExportEditor');
  const from = el<HTMLInputElement>('calendarExportFrom');
  const through = el<HTMLInputElement>('calendarExportThrough');
  const minutes = el<HTMLInputElement>('calendarExportThreshold');
  const example = el<HTMLSelectElement>('calendarExportExample');
  const includeSite = el<HTMLInputElement>('calendarExportIncludeSite');
  const button = el<HTMLButtonElement>('calendarExportDownload');
  const back = el<HTMLButtonElement>('calendarExportBack');
  const choices = {
    moons: el<HTMLInputElement>('calendarExportMoons'),
    weekends: el<HTMLInputElement>('calendarExportWeekends'),
    nights: el<HTMLInputElement>('calendarExportNights'),
  };
  const counts = {
    moons: el('calendarExportMoonsCount'),
    weekends: el('calendarExportWeekendsCount'),
    nights: el('calendarExportNightsCount'),
  };
  let session: { range: NightRange; settings: Thresholds } | null = null;
  let events: CalendarEvent[] = [];
  let busy = false;

  function showHelp(show: boolean): void {
    editor.hidden = show;
    el('calendarExportHelp').hidden = !show;
    button.hidden = show;
    back.hidden = !show;
    el('calendarExportTitle').textContent = show ? 'Import your file' : 'Export to calendar';
  }

  function render(): void {
    if (!session) return;
    const { range } = session;
    minutes.disabled = !choices.nights.checked;
    el('calendarExportThresholdRow').hidden = minutes.disabled;
    const validDates = from.validity.valid && through.validity.valid && from.value <= through.value;
    const validMinutes = minutes.disabled || minutes.validity.valid;
    const matches = selectCalendarEvents(
      range,
      validDates ? { from: from.value, through: through.value } : { from: '', through: '' },
      minutes.validity.valid && minutes.value !== '' ? minutes.valueAsNumber : Infinity,
    );
    const previous = example.value;
    const available = calendarKinds.filter((kind) => choices[kind].checked && matches[kind].length);
    events = available.flatMap((kind) => matches[kind]);
    for (const kind of calendarKinds) counts[kind].textContent = String(matches[kind].length);
    example.replaceChildren(...available.map((kind) => new Option(eventLabels[kind], kind)));
    if ([...example.options].some((option) => option.value === previous)) example.value = previous;
    else if (available.includes('weekends')) example.value = 'weekends';
    example.disabled = events.length === 0;
    const sample = available.find((kind) => kind === example.value);
    const group = sample ? matches[sample] : [];
    const event =
      group.find((entry) => entry.kind === 'nights' && entry.night.mf.length > 1) ??
      group.find((entry) => entry.kind === 'nights' && entry.night.mfMs < entry.night.tdMs) ??
      group[0];
    const count = `${events.length} ${events.length === 1 ? 'event' : 'events'} in file`;
    const countLabel = el('calendarExportCount');
    if (countLabel.textContent !== count) countLabel.textContent = count;
    const error = !validDates
      ? 'Choose dates in the loaded range, with From on or before Through.'
      : !validMinutes
        ? 'Enter a whole number from 0 to 1,500 minutes.'
        : !events.length
          ? 'No events match this selection.'
          : '';
    el('calendarExportStatus').textContent = error;
    button.disabled = busy || Boolean(error);
    el('calendarExportEvent').hidden = !event;
    el('calendarExportPrivacyLabel').textContent = includeSite.checked
      ? '· Site included in links'
      : '· Site excluded';
    el('calendarExportSiteFields').hidden = !includeSite.checked;
    if (!event) return;

    const { title, highlights, details } = calendarEventDescriptions(range.tz.name)(event);
    const start = dateLabel.format(new Date(event.start));
    const end = event.kind === 'weekends' ? dateLabel.format(new Date(event.through)) : '';
    el('calendarExportEventTitle').textContent = title;
    el('calendarExportEventDates').textContent = end ? `${start} – ${end}` : start;
    paragraphs(el('calendarExportHighlights'), highlights);
    el('calendarExportDetails').hidden = details.length === 0;
    paragraphs(el('calendarExportFacts'), details);
    el('calendarExportLinkNote').textContent = includeSite.checked
      ? 'Open in Atlas includes the original site.'
      : 'Open in Atlas uses your current site.';
  }

  el('calendarExportBtn').addEventListener('click', () => {
    closeAppMenu();
    const { range, ready } = data;
    if (!range || !ready) return;
    session = { range, settings: { moonAlt: S.moonAlt, crescent: S.crescent } };
    const first = range.nights[0].id;
    const last = range.nights.at(-1)!.id;
    const tonight = tonightId(Date.now(), range.tz);
    const start =
      first <= tonight && tonight <= last ? tonight : (range.nights[S.sel]?.id ?? first);
    from.min = through.min = first;
    from.max = through.max = last;
    from.value = start;
    const monthEnd = addCalendarDays(start, 29);
    through.value = monthEnd < last ? monthEnd : last;
    choices.moons.checked = true;
    choices.weekends.checked = true;
    choices.nights.checked = false;
    minutes.value = '60';
    includeSite.checked = false;
    el<HTMLDetailsElement>('calendarExportPrivacy').open = false;
    el<HTMLDetailsElement>('calendarExportDetails').open = false;
    el('calendarExportSite').textContent = `${range.site.name} · ${range.tz.name}`;
    const { name, lat, lon, tz, elevation } = range.site;
    el('calendarExportSiteFields').textContent =
      `Links contain ${name}, ${lat}, ${lon}, ${tz}${elevation == null ? '' : ` and ${elevation} m elevation`}. Anyone with the file can read these details.`;
    el('calendarExportMoonSettings').textContent = moonSettingsText(session.settings);
    example.replaceChildren();
    showHelp(false);
    render();
    modal.show();
  });
  form.addEventListener('input', render);
  dialog.addEventListener('shown.bs.modal', () => from.focus());
  dialog.addEventListener('hide.bs.modal', () => {
    session = null;
  });
  dialog.addEventListener('hidden.bs.modal', () => el('moreBtn').focus({ preventScroll: true }));
  back.addEventListener('click', () => {
    showHelp(false);
    button.focus();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!session || button.hidden || button.disabled) return;
    const current = session;
    if (
      !data.ready ||
      current.range !== data.range ||
      current.settings.moonAlt !== S.moonAlt ||
      current.settings.crescent !== S.crescent
    ) {
      el('calendarExportStatus').textContent =
        'The planner changed. Reopen export to refresh the preview.';
      return;
    }
    const dates = { from: from.value, through: through.value };
    const filename = `atlas-${dates.from}-to-${dates.through}.ics`;
    busy = button.disabled = editor.inert = true;
    try {
      const records = makeCalendarRecords(
        current.range,
        events,
        dates,
        current.settings,
        minutes.valueAsNumber,
        location.href,
        includeSite.checked,
      );
      const contents = await serializeCalendar(records, new Date());
      if (session !== current) return;
      downloadFile(contents, filename, 'text/calendar;charset=utf-8');
      el('calendarExportFilename').textContent = filename;
      showHelp(true);
      back.focus();
    } catch {
      if (session === current)
        el('calendarExportStatus').textContent =
          'Could not create the calendar file. Try again or shorten the date range.';
    } finally {
      busy = button.disabled = editor.inert = false;
    }
  });
}
