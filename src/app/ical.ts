export interface AllDayEvent {
  start: string;
  through: string;
  title: string;
  description: string;
  url: string;
  /** Only information already visible in the event, independent of its link or export range. */
  identity: string;
}

export function addCalendarDays(date: string, days: number): string {
  const utc = new Date(date + 'T00:00:00Z');
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

const encoder = new TextEncoder();
const text = (value: string): string =>
  value
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/[,;]/g, '\\$&');

/** RFC 5545 limits physical lines to 75 bytes, including the continuation space. */
function fold(line: string): string {
  let result = '';
  let width = 0;
  for (const character of line) {
    const code = character.codePointAt(0)!;
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (width + size > 75) {
      result += '\r\n ';
      width = 1;
    }
    result += character;
    width += size;
  }
  return result;
}

export async function serializeCalendar(events: AllDayEvent[], generated: Date): Promise<string> {
  const stamp = generated
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  const date = (value: string) => value.replaceAll('-', '');
  const records = await Promise.all(
    events.map(async (event) => {
      const hash = await crypto.subtle.digest('SHA-256', encoder.encode(event.identity));
      const uid =
        Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('') +
        '@night-planner-atlas';
      return [
        'BEGIN:VEVENT',
        'UID:' + uid,
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + date(event.start),
        // The end of an all-day event is exclusive, including for a Friday–Saturday trip.
        'DTEND;VALUE=DATE:' + date(addCalendarDays(event.through, 1)),
        'TRANSP:TRANSPARENT',
        'SUMMARY:' + text(event.title),
        'DESCRIPTION:' + text(event.description),
        'URL:' + event.url,
        'END:VEVENT',
      ];
    }),
  );
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Night Planner Atlas//Calendar Export//EN',
      'CALSCALE:GREGORIAN',
      ...records.flat(),
      'END:VCALENDAR',
    ]
      .map(fold)
      .join('\r\n') + '\r\n'
  );
}
