import { expect, test } from 'vitest';
import { serializeCalendar, type AllDayEvent } from './ical';

test('serializes advisory events with a civil end date and UTF-8-safe folding', async () => {
  const title = 'Moon, stars; backslash \\ and ' + '🌙'.repeat(30);
  const url = 'https://atlas.example/#npa=1&start=2026-10';
  const description = 'Friday\r\nSaturday\nBEGIN:VEVENT';
  const event: AllDayEvent = {
    start: '2026-10-30',
    through: '2026-10-31',
    title,
    description,
    url,
    identity: 'test-trip',
  };
  const output = await serializeCalendar([event], new Date('2026-10-30T00:01:02Z'));
  expect(output).toMatch(/\r\nEND:VCALENDAR\r\n$/);
  for (const line of output.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  const lines = output.replace(/\r\n /g, '').split('\r\n');
  expect(lines).toContain('DTSTART;VALUE=DATE:20261030');
  expect(lines).toContain('DTEND;VALUE=DATE:20261101');
  expect(lines).toContain('DTSTAMP:20261030T000102Z');
  expect(lines).toContain('TRANSP:TRANSPARENT');
  expect(lines).toContain('SUMMARY:Moon\\, stars\\; backslash \\\\ and ' + '🌙'.repeat(30));
  expect(lines).toContain('DESCRIPTION:Friday\\nSaturday\\nBEGIN:VEVENT');
  expect(lines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(1);
  expect(lines).not.toContain('BEGIN:VALARM');

  const repeat = await serializeCalendar(
    [{ ...event, url: url + '&lat=47', description: 'Different export metadata' }],
    new Date('2026-10-31T00:00:00Z'),
  );
  const uid = (value: string) => value.replace(/\r\n /g, '').match(/^UID:.*$/m)?.[0];
  expect(uid(output)).toMatch(/^UID:[0-9a-f]{64}@night-planner-atlas$/);
  expect(uid(repeat)).toBe(uid(output));
});
