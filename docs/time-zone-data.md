# Offline time-zone data

The site bundles `tzf-wasm` **2.0.1**, pinned in `package-lock.json`. Its JS loader and WASM are
served from the same origin. A single worker prepares the finder when the app opens, so later
coordinate edits need no network access. Construction and lookups do not run on the UI thread.
The inferred IANA zone is visible and editable. Multiple results require an explicit choice.
Geometry is simplified; a result is not a guarantee about a political boundary or current local
practice. Browser time-zone rules age separately from these geographic boundaries.

## Provenance and matching data

- npm artifact: <https://registry.npmjs.org/tzf-wasm/-/tzf-wasm-2.0.1.tgz>
- npm integrity: `sha512-GEi5hTQA4Q98Hp2HI/u2/wCGF+YX2s8841Q5B/V1ZqRnH6y3GTGRlfF8Olbu7IoSf0d69iWzec81DqdfcIdUlg==`
- npm's signed provenance identifies source commit
  `5bae5b8a410460555e348aa527ea6919aa220fcb` in
  <https://github.com/ringsaturn/tzf-wasm>.
- That commit's Cargo lock pins `tzf-rs` **2.1.3** and `tzf-dist` **0.0.2026-e**.
  The runtime finder reports **2026e**, with 444 zone names.
- WASM SHA-256: `399880b5d898980f42a4975aa3ab76f68ad1a5f914720b8255d6a3b5dac98f3e`.
- [The downloadable dataset](../public/data/timezones-2026e.tzb) is `lite.tzb` from
  <https://static.crates.io/crates/tzf-dist/tzf-dist-0.0.2026-e.crate>, whose SHA-256 is
  `bcbf869a5795bbc7b56c3430df4e153e1bb80d5f0dce43ae3965f4f8c0ad8b77`.
- Dataset SHA-256: `489559b612a2191d15d80b709b4b4d16efff8f7219907e6ce90cf5b124ed182c`.
  It is 4,102,443 bytes. Its complete byte sequence was verified in the initialized WASM's
  linear memory, starting at byte 1,062,008. This verifies the matching artifact rather than
  inferring a match from a version string. WASM optimization splits the original file into
  separate data segments, so searching the uninitialized WASM file alone is insufficient.

TZB is an open, machine-readable format, usable independently of the WASM wrapper. Its format
and source/rebuild tools are documented by [tzf](https://github.com/ringsaturn/tzf) and
[tzf-dist](https://github.com/ringsaturn/tzf-dist). The download preserves the upstream data
without app-specific boundary changes.

## Licenses and attribution

The wrapper and compiled code use MIT or another permissive alternative. All crates in the
exact source lockfile were downloaded and SHA-256 checked before adding the package. MIT is
chosen where an alternative is offered; `unicode-ident` also carries Unicode-3.0. The lockfile's
platform-only `libc` and `r-efi` dependencies are not part of the browser target.

The boundary data is ODbL 1.0, approved for this feature in
[issue #20](https://github.com/mikemag/night-planner-atlas/issues/20). Attribution names
OpenStreetMap contributors, timezone-boundary-builder and tzf-dist in the How it works credits.
[Full code/data notices](../public/licenses/timezone-notices.txt), including ODbL, ship with the
site and are readable within its guide offline. The matching dataset is offered separately.
Third-party code and data retain their own licenses independently of the app's license.
Private favorites and astronomical results are separate from the boundary dataset.

## Updating

1. Review the new package's exact source provenance, compiled dependency licenses and data
   vintage before changing the pinned dependency. Preserve all notices and credits.
2. Download the matching `tzf-dist` crate, verify its locked checksum, and extract `lite.tzb`.
   Initialize the new package in Node and verify that the dataset's complete bytes occur in
   `InitOutput.memory.buffer`. Check `WasmFinder.data_version()` and zone count.
3. Replace the named download, notices, expected worker data version and these hashes together.
   If the runtime representation changes, establish a new reproducible matching-data check.
4. Run project checks and browser tests, including remote sites, both sides of boundaries,
   manual overrides, rapid edits and new coordinates with the network disabled. Measure
   construction/lookup responsiveness in browser workers; emulation is not a physical-phone test.

No background update or third-party runtime lookup is used.
