import { Observer } from 'astronomy-engine';
import { computeNight, computeSolarNight } from '../model/night';
import { TimeZone } from '../model/time';
import type { NightReply, NightRequest } from './night-worker-protocol';

let identity = '';
let observer: Observer;
let tz: TimeZone;

self.onmessage = ({ data }: MessageEvent<NightRequest>) => {
  const { id, site } = data;
  const date = 'date' in data ? data.date : data.dates[0];
  try {
    // Keep the formatter's hourly offset cache bounded while browsing many years.
    const key = JSON.stringify([
      site.lat,
      site.lon,
      site.elevation ?? 0,
      site.tz,
      date[0],
      date[1],
    ]);
    if (key !== identity) {
      observer = new Observer(site.lat, site.lon, site.elevation ?? 0);
      tz = new TimeZone(site.tz);
      identity = key;
    }
    if ('dates' in data) {
      const solar = data.dates.map((date) => {
        const { tz: zone, ...night } = computeSolarNight(observer, tz, ...date);
        void zone;
        return night;
      });
      self.postMessage({ id, solar } satisfies NightReply);
      return;
    }
    const { tz: zone, ...night } = computeNight(
      observer,
      tz,
      ...date,
      data.solar ? { ...data.solar, tz } : undefined,
    );
    void zone;
    const reply: NightReply = { id, night };
    self.postMessage(reply, {
      transfer: [
        night.moonAlt.buffer,
        night.moonlight.buffer,
        night.sunAlt.buffer,
      ] as ArrayBuffer[],
    });
  } catch {
    // Library exceptions may contain private inputs. Send neither the error nor its message.
    const reply: NightReply = { id, failed: true };
    self.postMessage(reply);
  }
};
