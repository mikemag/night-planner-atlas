/** Display references, not atmospheric measurements of the observing site. */
export const MIN_MOON_OPACITY = 0.17;
export const MAX_MOON_OPACITY = 0.57;
const DEG = Math.PI / 180;
const EXTINCTION = 0.172; // V magnitudes per airmass
const DARK_SKY = 34.08 * Math.exp(20.7233 - 0.92104 * 21.6); // nanoLamberts
const airmass = (zenithAngle: number) => (1 - 0.96 * Math.sin(zenithAngle * DEG) ** 2) ** -0.5;

/**
 * Added zenith moonlight in nL, from Krisciunas & Schaefer (1991), equations
 * 15, 20 and 21: https://articles.adsabs.harvard.edu/pdf/1991PASP..103.1033K
 * Original implementation. Physical phase angle is 0° full, 180° new.
 * Hold the geometric center at 0° near rise/set and at 80° near zenith: the
 * latter keeps separation >=10°, outside the model's excluded lunar aureole.
 * No opposition/distance correction or prediction of local weather/sky glow.
 */
export function zenithMoonlight(phaseAngle: number, altitude: number): number {
  const height = Math.max(0, Math.min(80, altitude));
  const separation = 90 - height;
  const incident = 10 ** (-0.4 * (3.84 + 0.026 * phaseAngle + 4e-9 * phaseAngle ** 4));
  const scattering =
    10 ** 5.36 * (1.06 + Math.cos(separation * DEG) ** 2) + 10 ** (6.15 - separation / 40);
  return (
    scattering *
    incident *
    10 ** (-0.4 * EXTINCTION * airmass(90 - height)) *
    (1 - 10 ** (-0.4 * EXTINCTION))
  );
}

const FULL_MOON = Math.log1p(zenithMoonlight(0, 60) / DARK_SKY);

/** Brighter mapping selected in #8. Apply only inside physical Moon-up/dark intervals. */
export function moonlightOpacity(phaseAngle: number, altitude: number): number {
  const normalized = Math.log1p(zenithMoonlight(phaseAngle, altitude) / DARK_SKY) / FULL_MOON;
  return Math.min(MAX_MOON_OPACITY, MIN_MOON_OPACITY + 0.4 * Math.sqrt(normalized));
}
