# Interim NGP build

`@analogjs/vite-plugin-angular` bundles a build of Angular's experimental hybrid
preprocessor in `packages/vite-plugin-angular/ngp`. `compilation: 'ngp'` uses it
when the application does not provide `@angular/ngp`. Remove it once a compatible
`@angular/ngp` is published.

The directory is generated and committed:

- `api.mjs`: the NGP JavaScript API, bundled with the Angular compiler from the same revision.
- `ng_analyze.cjs`, `ng_analyze_bg.wasm`: the WebAssembly analyzer.
- `LICENSE`: Angular's license.
- `build.json`: the Angular revision and wasm-bindgen version.

## Regenerate

Run from the Analog repository root after `pnpm i`. The helper requires an
authenticated GitHub CLI (`gh`), `tar`, the Rust toolchain used by the pinned
Angular source with the wasm target, and the wasm-bindgen CLI matching the
source's `Cargo.lock` (the helper reports a mismatch):

```sh
rustup toolchain install 1.95.0
rustup target add wasm32-unknown-unknown --toolchain 1.95.0
cargo install wasm-bindgen-cli --version 0.2.121 --locked
pnpm nx run vite-plugin-angular:prepare-ngp
```

To update the revision, change `revision` in `tools/scripts/prepare-ngp.mjs`.
To reuse an existing checkout of that revision and skip the download, set
`NGP_SOURCE` to its absolute path:

```sh
NGP_SOURCE=/absolute/path/to/angular pnpm nx run vite-plugin-angular:prepare-ngp
```

## Overrides

- `ANALOG_NGP_COMPILER`: path to another NGP API module.
- `ANALOG_NGP_NATIVE_BINDING`: path to a native analyzer (`.node`) built from the
  same revision, used instead of the WebAssembly analyzer.

## Run analog-app

`ANALOG_NGP=true` selects the `ngp` compilation path in the example app's Vite
configuration:

```sh
ANALOG_NGP=true pnpm nx serve analog-app
ANALOG_NGP=true pnpm nx build analog-app --configuration=production
```
