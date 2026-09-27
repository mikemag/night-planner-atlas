/** The element with this id; a missing element is a markup bug, so it throws. */
export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing element #${id}`);
  return e as T;
}

export const scroller = el<HTMLDivElement>('scroller');
