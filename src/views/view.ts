/** What sits under the pointer in a canvas view. */
export interface Hit {
  /** Night index. */
  i?: number;
  /** Clock position in wall-clock hours after noon, when the view has a time axis there. */
  hh?: number | null;
  /** Calendar week containing the activated date, including neighboring-month dates. */
  week?: string;
  /** Year month to open. */
  month?: string;
  /** The River's minimap. */
  mini?: boolean;
  y?: number;
}

/**
 * A view drawn on the shared canvas. The canvas stays pinned to the scroller's viewport;
 * `total` sets the scrollable height and `draw` paints the part visible at `scrollTop`.
 */
export interface CanvasView {
  total: number;
  layout(): void;
  draw(scrollTop: number): void;
  hit(px: number, py: number): Hit | null;
  /** Bring night `i` into view; `top` puts it at the top. */
  scrollTo(i: number, top: boolean): void;
  /** Index of the first night visible at the top. */
  topNight(): number;
}
