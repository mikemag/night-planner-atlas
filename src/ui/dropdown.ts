import type Dropdown from 'bootstrap/js/dist/dropdown';

/** Let Popper shift either axis when a short viewport cannot fit a panel beside its trigger. */
export const dropdownOptions: Partial<Dropdown.Options> = {
  popperConfig: (config) => ({
    ...config,
    strategy: 'fixed',
    modifiers: [
      ...(config.modifiers ?? []),
      { name: 'preventOverflow', options: { padding: 8, altAxis: true } },
    ],
  }),
};
