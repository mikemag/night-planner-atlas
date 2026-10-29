import { lookupTimeZones } from '../app/timezones';

/** A draft's inferred zone may be replaced by a deliberate manual edit at any time. */
export function bindSiteZone(
  coordinates: () => { lat: number; lon: number } | null,
  zone: HTMLInputElement,
  status: HTMLElement,
  choices: HTMLDataListElement,
): { infer: () => void; cancel: () => void } {
  let sequence = 0,
    timer = 0;
  const cancel = () => {
    sequence++;
    clearTimeout(timer);
  };
  zone.addEventListener('input', () => {
    cancel();
    status.textContent = 'Manual time-zone override.';
  });
  const infer = () => {
    cancel();
    const token = sequence;
    const point = coordinates();
    zone.value = '';
    choices.replaceChildren();
    if (!point) {
      status.textContent = 'Enter valid coordinates to find the time zone.';
      return;
    }
    status.textContent = 'Finding the time zone offline…';
    timer = window.setTimeout(async () => {
      try {
        const zones = await lookupTimeZones(point.lat, point.lon);
        if (token !== sequence) return;
        for (const name of zones) choices.appendChild(new Option(name, name));
        if (zones.length === 1) {
          try {
            new Intl.DateTimeFormat('en-US', { timeZone: zones[0] });
          } catch {
            status.textContent =
              'This browser does not recognize the inferred zone. Enter a supported IANA zone manually.';
            return;
          }
          zone.value = zones[0];
          status.textContent = 'Inferred offline. Check the zone; you can edit it.';
        } else {
          status.textContent = zones.length
            ? 'More than one zone covers this point. Choose the correct zone from the suggestions or enter one.'
            : 'No zone found for this point. Enter the site’s IANA time zone manually.';
        }
      } catch {
        if (token === sequence)
          status.textContent =
            'Offline lookup is unavailable. Enter the site’s IANA time zone manually.';
      }
    }, 200);
  };
  return { infer, cancel };
}
