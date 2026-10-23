# Local NGP build setup

Build the experimental Angular hybrid preprocessor used by
`compilation: 'ngp'` and try it with `analog-app`.

## Prerequisites

Run the commands below from the Analog repository root. Install the workspace
dependencies with `pnpm i`. The build helper also requires an authenticated GitHub
CLI (`gh`), `tar`, and the Rust toolchain used by the pinned Angular source:

```sh
rustup toolchain install 1.95.0
```

## Build the compiler

```sh
pnpm nx run analog-app:prepare-ngp
```

This target runs `tools/scripts/prepare-ngp.mjs`. It downloads Angular revision
`4e4ad75144e55538cedc65f0ac3ff5b68cb34ce9`, builds the native analyzer, and bundles
the JavaScript API with the matching Angular compiler source. The application's
Angular runtime stays unchanged.

The output is written to `node_modules/.cache/analog-ngp`:

- `api.mjs`: the JavaScript compiler API.
- `analyzer.node`: the native analyzer for the current platform.
- `build.json`: the revision and source directory used by the helper.

To reuse an existing checkout of that Angular revision, set `NGP_SOURCE` to its
absolute path. This skips the source download:

```sh
NGP_SOURCE=/absolute/path/to/angular pnpm nx run analog-app:prepare-ngp
```

## Run analog-app

Enable NGP in the current shell (`node_modules/.cache/analog-ngp` is resolved
automatically, or override with `ANALOG_NGP_COMPILER` and
`ANALOG_NGP_NATIVE_BINDING`):

```sh
export ANALOG_NGP=true
```

Serve the app:

```sh
pnpm nx serve analog-app
```

Or build it for production (runs in-memory TypeScript 7 and Angular template type checking by default):

```sh
pnpm nx build analog-app --configuration=production
```

`ANALOG_NGP=true` selects the `ngp` compilation path in the example app's Vite
configuration. Unset it to return to the default compilation path:

```sh
unset ANALOG_NGP ANALOG_NGP_COMPILER ANALOG_NGP_NATIVE_BINDING
```
