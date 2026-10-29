/** Current civil time at the site, independent of both the chart date and the viewer's zone. */
export function formatSiteClock(timeZone: string, now: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  const clock = `${part('month')} ${part('day')}, ${part('hour')}:${part('minute')} ${part('dayPeriod')} ${part('timeZoneName')}`;
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')!
    .value.replace('GMT', 'UTC')
    .replace('-', '−');
  return `${clock} (${offset}) · ${timeZone}`;
}
