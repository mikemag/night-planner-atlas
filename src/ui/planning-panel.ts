import Dropdown from 'bootstrap/js/dist/dropdown';
import Modal from 'bootstrap/js/dist/modal';
import { el } from './dom';

/** Reuse the same controls in a phone dialog and in the desktop header. */
export function initPlanningPanel(): void {
  const compact = matchMedia('(max-width: 700px), (max-width: 1100px) and (max-height: 500px)');
  const controls = el('planningControls');
  const header = controls.parentElement!;
  const tonight = el('todayBtn');
  const rangeActions = tonight.parentElement!;
  const actions = el('planActions');
  const trigger = el('planSettingsBtn');
  const dialog = el('planningDialog');
  const modal = new Modal(dialog);
  const rangePicker = el('rangePicker');
  const closeRange = () => Dropdown.getInstance(rangePicker)?.hide();

  trigger.addEventListener('click', () => modal.show());
  el('planningDone').addEventListener('click', () => modal.hide());
  dialog.addEventListener('shown.bs.modal', () => {
    trigger.setAttribute('aria-expanded', 'true');
    rangePicker.focus({ preventScroll: true });
  });
  dialog.addEventListener('hide.bs.modal', closeRange);
  dialog.addEventListener('hidden.bs.modal', () => {
    trigger.setAttribute('aria-expanded', 'false');
    if (compact.matches) trigger.focus({ preventScroll: true });
  });
  // Escape first closes the nested range picker, then the settings dialog.
  dialog.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Tab') {
        const fields = [
          ...dialog.querySelectorAll<HTMLElement>('button, select, input, a[href], [tabindex="0"]'),
        ].filter((field) => !field.matches(':disabled') && field.getClientRects().length > 0);
        const first = fields[0];
        const last = fields.at(-1);
        if (
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
        return;
      }
      if (event.key !== 'Escape' || !el('rangeMenu').classList.contains('show')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeRange();
      rangePicker.focus({ preventScroll: true });
    },
    true,
  );

  const layout = () => {
    const focused = document.activeElement as HTMLElement | null;
    const movingFocus =
      controls.contains(focused) || dialog.contains(focused) || focused === trigger;
    closeRange();
    if (compact.matches) {
      el('planningPanel').appendChild(controls);
      actions.appendChild(tonight);
      if (movingFocus) trigger.focus({ preventScroll: true });
    } else {
      modal.hide();
      header.appendChild(controls);
      rangeActions.appendChild(tonight);
      if (movingFocus)
        (focused && controls.contains(focused) ? focused : rangePicker).focus({
          preventScroll: true,
        });
    }
  };
  layout();
  document.documentElement.dataset.planningReady = '';
  compact.addEventListener('change', layout);
}
