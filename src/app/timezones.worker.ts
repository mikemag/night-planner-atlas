/*! tzf-wasm 2.0.1 (MIT), powered by tzf-rs. Boundary data: OpenStreetMap contributors,
 * via timezone-boundary-builder and tzf-dist, ODbL 1.0. Full notices: licenses/timezone-notices.txt. */
import init, { WasmFinder } from 'tzf-wasm';
import wasmUrl from 'tzf-wasm/tzf_wasm_bg.wasm?url';

let finder: WasmFinder;

async function prepare(): Promise<void> {
  try {
    await init({ module_or_path: wasmUrl });
    finder = new WasmFinder();
    if (finder.data_version() !== '2026e') throw new Error('Unexpected boundary data version');
    postMessage({ ready: true });
  } catch {
    postMessage({ ready: false });
  }
}

onmessage = (event: MessageEvent<{ id: number; lat: number; lon: number }>) => {
  const { id, lat, lon } = event.data;
  try {
    postMessage({ id, zones: finder.get_tz_names(lon, lat) });
  } catch {
    postMessage({ id, error: true });
  }
};

void prepare();
