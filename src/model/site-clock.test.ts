import { expect, it } from 'vitest';
import { formatSiteClock } from './site-clock';

it('shows the site date across the date line and a quarter-hour offset', () => {
  const now = Date.parse('2026-10-28T23:30:00Z');
  expect(formatSiteClock('Asia/Kathmandu', now)).toBe(
    'Oct 29, 5:15 AM GMT+5:45 (UTC+05:45) · Asia/Kathmandu',
  );
  expect(formatSiteClock('America/Los_Angeles', now)).toBe(
    'Oct 28, 4:30 PM PDT (UTC−07:00) · America/Los_Angeles',
  );
});

it('updates the civil offset through the repeated DST hour', () => {
  expect(formatSiteClock('America/Los_Angeles', Date.parse('2026-11-01T08:30:00Z'))).toContain(
    '1:30 AM PDT (UTC−07:00)',
  );
  expect(formatSiteClock('America/Los_Angeles', Date.parse('2026-11-01T09:30:00Z'))).toContain(
    '1:30 AM PST (UTC−08:00)',
  );
});
