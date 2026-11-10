import type { NightRange, RangeSpec } from '../model/range';
import type { Hit } from '../views/view';
import { hasFocusPreference, loadSettings, type Settings } from './settings';
import type { ComputeStats } from './compute-cached';

export interface UiState {
  /** Years to shift the rolling range from the default. */
  rangeShift: number;
  /** A calendar year or the fixed span from a shared plan. Null follows the site-local month. */
  fixedRange: RangeSpec | null;
  /** Initial selected evening date from a link, consumed when its initial month is available. */
  pendingNight: string | null;
  /** Worked-example previews keep their controls separate from saved preferences. */
  sharedSettings: boolean;
  /** Selected night index, or −1. */
  sel: number;
  /** The month being browsed, independently of the selected night. */
  calendarMonth: string | null;
  /** Insert the shared night timeline after the activated row. */
  calendarExpanded: boolean;
  calendarWeek: string | null;
  /** Expand the selected night in River Month; Year always stays compact. */
  riverExpanded: boolean;
  /** Lunations opens one horizontal night timeline beneath its cycle. */
  lunationsExpanded: boolean;
  /** Responsive defaults apply only until the user chooses a focus window. */
  focusExplicit: boolean;
  hover: Hit | null;
  /** Show the selected night's River summary after a tap, click or keyboard navigation. */
  riverReadoutSelected: boolean;
}

export type AppState = Settings & UiState;

/**
 * Settings and UI state. The shell and controls write it; views and shared night details read it.
 */
export const S: AppState = {
  ...loadSettings(),
  rangeShift: 0,
  fixedRange: null,
  pendingNight: null,
  sharedSettings: false,
  sel: -1,
  calendarMonth: null,
  calendarExpanded: false,
  calendarWeek: null,
  riverExpanded: false,
  lunationsExpanded: false,
  focusExplicit: hasFocusPreference(),
  hover: null,
  riverReadoutSelected: false,
};

/** Phone Lunations starts at seven nights without changing other views or saved preferences. */
export function activeFocus(): number {
  return S.view === 'lunations' &&
    !S.focusExplicit &&
    !S.sharedSettings &&
    window.matchMedia('(max-width: 600px)').matches
    ? 3
    : S.focus;
}

/**
 * `ready` means the entire range is complete. A progressive River range has explicit pending
 * geometry-only rows; other views and range-wide outputs must wait for `ready`.
 */
export const data: {
  range: NightRange | null;
  ready: boolean;
  progressive: boolean;
  pending: Set<string> | null;
  computation: ComputeStats | null;
} = { range: null, ready: false, progressive: false, pending: null, computation: null };

/** Only River can show a partially calculated range. Summaries and export require every night. */
export function viewReady(): boolean {
  return data.ready || (S.view === 'river' && data.progressive);
}
export function nightReady(i: number): boolean {
  const n = data.range?.nights[i];
  return !!n && !data.pending?.has(n.id);
}

/** The current range; only call once a range has been computed. */
export function atlas(): NightRange {
  if (!data.range) throw new Error('No nights have been computed yet');
  return data.range;
}
