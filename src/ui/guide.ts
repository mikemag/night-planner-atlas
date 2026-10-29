import { C, inkOn } from '../render/colors';
import { el } from './dom';
import guide from './guide.html?raw';
import astronomyNotices from '/licenses/astronomy-engine.txt?raw';
import timezoneNotices from '/licenses/timezone-notices.txt?raw';
import reference from '../model/testdata/usno.json';

export function initGuide(): void {
  el('notesView').innerHTML = guide;
  el('astronomyNotices').textContent = astronomyNotices;
  el('timezoneNotices').textContent = timezoneNotices;
  const list = el('referenceQueries');
  for (const source of reference.sources) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = `${source.site} · ${source.table}`;
    item.appendChild(link);
    list.appendChild(item);
  }
  const download = el<HTMLAnchorElement>('referenceFixture');
  download.href = URL.createObjectURL(
    new Blob([JSON.stringify(reference, null, 2)], { type: 'application/json' }),
  );
  updateGuideColors();
}

export function updateGuideColors(): void {
  for (const node of document.querySelectorAll<HTMLElement>('[data-sky-stage]')) {
    const color = C[node.dataset.skyStage as 'day' | 'civil' | 'naut' | 'astro' | 'dark'];
    node.style.background = color;
    node.style.color = inkOn(color);
  }
}
