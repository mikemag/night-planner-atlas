import { InverseRefraction, Refraction } from 'astronomy-engine';

/** Idealized refraction scales with air density (pressure / absolute temperature). */
export function apparentAltitude(geometric: number, density: number): number {
  return geometric + density * Refraction('normal', geometric);
}

/** Geometric altitude corresponding to an apparent altitude above the horizon. */
export function geometricAltitude(apparent: number, density: number): number {
  // Preserve the sea-level convention exactly, including its original golden records.
  if (density === 1) return apparent + InverseRefraction('normal', apparent);
  let altitude = apparent;
  for (let i = 0; i < 20; i++) {
    const error = apparentAltitude(altitude, density) - apparent;
    altitude -= error;
    if (Math.abs(error) < 1e-12) break;
  }
  return altitude;
}
