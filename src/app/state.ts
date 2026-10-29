import type { NightRange } from '../model/range';
import type { Hit } from '../views/view';
import { loadSettings, type Settings } from './settings';

export interface UiState {
  /** Years to shift the loaded range from the default. */
  rangeShift: number;
  /** Absolute first month from a shared plan; rangeShift still moves by years. */
  rangeStart: { y: number; m: number } | null;
  /** Initial selected evening date from a link, consumed only after its range finishes. */
  pendingNight: string | null;
  /** Shared controls remain temporary until the viewer deliberately saves them. */
  sharedSettings: boolean;
  /** Selected night index, or −1. */
  sel: number;
  /** Key of the expanded calendar week, if any. */
  expandedWeek: string | null;
  /** Expand the selected night in River Month; Year always stays compact. */
  riverExpanded: boolean;
  hover: Hit | null;
  /** Show the selected night's River summary after a tap, click or keyboard navigation. */
  riverReadoutSelected: boolean;
}

export type AppState = Settings & UiState;

/**
 * Settings and UI state. The shell and controls write it; views and the inspector read it.
 */
export const S: AppState = {
  ...loadSettings(),
  rangeShift: 0,
  rangeStart: null,
  pendingNight: null,
  sharedSettings: false,
  sel: -1,
  expandedWeek: null,
  riverExpanded: false,
  hover: null,
  riverReadoutSelected: false,
};

/**
 * The computed range. `ready` is false while a range computes; the previous range stays in
 * place (and on screen) until the new one replaces it.
 */
export const data: { range: NightRange | null; ready: boolean } = { range: null, ready: false };

/** The current range; only call once a range has been computed. */
export function atlas(): NightRange {
  if (!data.range) throw new Error('No nights have been computed yet');
  return data.range;
}
