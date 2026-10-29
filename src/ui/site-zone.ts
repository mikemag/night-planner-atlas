import { lookupTimeZones } from '../app/timezones';

/** A draft's inferred zone may be replaced by a deliberate manual edit at any time. */
export function bindSiteZone(
  coordinates: () => { lat: number; lon: number } | null,
  zone: HTMLInputElement,
  status: HTMLElement,
  choices: HTMLDataListElement,
): { infer: () => void; inferNow: () => Promise<boolean>; cancel: () => void } {
  let sequence = 0,
    timer = 0;
  const cancel = () => {
    sequence++;
    clearTimeout(timer);
  };
  zone.addEventListener('input', () => {
    cancel();
    status.textContent = zone.value.trim()
      ? 'Manual time-zone override.'
      : 'The time zone will be found from these coordinates when you save.';
  });
  const resolve = async (point: { lat: number; lon: number }, token: number) => {
    try {
      const zones = await lookupTimeZones(point.lat, point.lon);
      if (token !== sequence) return false;
      for (const name of zones) choices.appendChild(new Option(name, name));
      if (zones.length === 1) {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: zones[0] });
        } catch {
          status.textContent =
            'This browser does not recognize the inferred zone. Enter a supported IANA zone manually.';
          return false;
        }
        zone.value = zones[0];
        status.textContent = 'Inferred offline. Check the zone; you can edit it.';
        return true;
      }
      status.textContent = zones.length
        ? 'More than one zone covers this point. Choose the correct zone from the suggestions or enter one.'
        : 'No zone found for this point. Enter the site’s IANA time zone manually.';
    } catch {
      if (token === sequence)
        status.textContent =
          'Offline lookup is unavailable. Enter the site’s IANA time zone manually.';
    }
    return false;
  };
  const start = () => {
    cancel();
    const point = coordinates();
    zone.value = '';
    choices.replaceChildren();
    status.textContent = point
      ? 'Finding the time zone offline…'
      : 'Enter valid coordinates to find the time zone.';
    return point;
  };
  const infer = () => {
    const point = start(),
      token = sequence;
    if (point) timer = window.setTimeout(() => void resolve(point, token), 200);
  };
  const inferNow = () => {
    const point = start();
    return point ? resolve(point, sequence) : Promise.resolve(false);
  };
  return { infer, inferNow, cancel };
}
