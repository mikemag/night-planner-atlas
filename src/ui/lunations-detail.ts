import type { Night } from '../model/night';
import {
  NIGHT_DETAIL_HEIGHT,
  prepareNightDetail,
  placeNightDetail,
  type DetailGeometry,
} from './night-detail';
export const LUNATION_DETAIL_HEIGHT = NIGHT_DETAIL_HEIGHT;
export function prepareLunationsDetail(n: Night | null, g: DetailGeometry, outside: boolean): void {
  prepareNightDetail('lunationsDetail', n, g, outside);
}
export function placeLunationsDetail(
  top: number,
  scrollTop: number,
  left: number,
  width: number,
  axis: number,
): void {
  placeNightDetail('lunationsDetail', top, scrollTop, left, width, axis);
}
