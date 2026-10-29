# Third-party notices

Night Planner Atlas includes the following third-party software.

| Project                                                      | Copyright                         | Version | License | Location                                            |
| ------------------------------------------------------------ | --------------------------------- | ------- | ------- | --------------------------------------------------- |
| [Astronomy Engine](https://github.com/cosinekitty/astronomy) | Copyright (c) 2019-2023 Don Cross | 2.1.19  | MIT     | npm `astronomy-engine`, bundled into `dist/assets/` |

The minified bundle keeps the library's MIT license header (see `vite.config.ts`), and the npm
package's source carries the same notice. The site credits Astronomy Engine on its Notes page.

## Offline time-zone lookup

`tzf-wasm` 2.0.1 (MIT), backed by `tzf-rs` 2.1.3, ships with boundary data 2026e from
OpenStreetMap contributors, via timezone-boundary-builder and `tzf-dist` 0.0.2026-e (ODbL 1.0).
The ODbL approval and distribution requirements are recorded in issue #20. The app's own
license does not override the licenses of these components.

[Full notices and licenses](public/licenses/timezone-notices.txt) ship with the site and are
also included in its offline guide. They include the wrapper and its compiled Rust dependencies;
MIT is selected where offered, with the additional Unicode-3.0 notice for `unicode-ident`.
The lockfile's platform-only `libc` and `r-efi` are not compiled into the browser target.

[Data provenance and update procedure](docs/time-zone-data.md) identify the exact source,
checksums, license audit and matching [machine-readable dataset](public/data/timezones-2026e.tzb).
Visible credit and the data download appear beside the site/time-zone editor and in the guide.
