import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))(
  'esbuild',
);

const revision = '457071571225970890bd5a6baee21373d3960c37';
const output = resolve('packages/vite-plugin-angular/ngp');
const source =
  process.env.NGP_SOURCE ?? (await mkdtemp(join(tmpdir(), 'analog-ngp-')));

if (!process.env.NGP_SOURCE) {
  const archive = await open(join(source, 'angular.tar.gz'), 'w');
  try {
    execFileSync('gh', ['api', `repos/angular/angular/tarball/${revision}`], {
      stdio: ['ignore', archive.fd, 'inherit'],
    });
  } finally {
    await archive.close();
  }
  execFileSync('tar', [
    '-xzf',
    join(source, 'angular.tar.gz'),
    '-C',
    source,
    '--strip-components=1',
  ]);
}

// wasm-bindgen's CLI must match the crate version locked by the Angular source.
const lock = await readFile(join(source, 'Cargo.lock'), 'utf-8');
const bindgenVersion = /name = "wasm-bindgen"\nversion = "([^"]+)"/.exec(
  lock,
)?.[1];
const installedBindgen = execFileSync('wasm-bindgen', ['--version'], {
  encoding: 'utf-8',
}).trim();
if (installedBindgen !== `wasm-bindgen ${bindgenVersion}`) {
  throw new Error(
    `Expected wasm-bindgen ${bindgenVersion}, found "${installedBindgen}". Run: cargo install wasm-bindgen-cli --version ${bindgenVersion} --locked`,
  );
}

execFileSync(
  'cargo',
  [
    '+1.95.0',
    'build',
    '--release',
    '--locked',
    '--target',
    'wasm32-unknown-unknown',
    '-p',
    'ng-analyze',
    '--lib',
  ],
  { cwd: source, stdio: 'inherit' },
);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const bindgenOut = join(source, 'target/ng-analyze-wasm');
execFileSync('wasm-bindgen', [
  '--target',
  'nodejs',
  '--no-typescript',
  '--out-dir',
  bindgenOut,
  join(source, 'target/wasm32-unknown-unknown/release/ng_analyze.wasm'),
]);
// The generated glue is CommonJS; the package is "type": "module".
await copyFile(
  join(bindgenOut, 'ng_analyze.js'),
  join(output, 'ng_analyze.cjs'),
);
await copyFile(
  join(bindgenOut, 'ng_analyze_bg.wasm'),
  join(output, 'ng_analyze_bg.wasm'),
);

// NGP uses compiler APIs newer than the Angular version installed in Analog.
// Bundle its matching compiler and compiler-cli internals from the same revision,
// without changing the app runtime.
await build({
  absWorkingDir: source,
  entryPoints: [join(source, 'packages/compiler-cli/preprocessor/api.ts')],
  outfile: join(output, 'api.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: {
    '@angular/compiler': join(source, 'packages/compiler/src/compiler.ts'),
    '@angular/compiler-cli/private/hybrid_analysis': join(
      source,
      'packages/compiler-cli/private/hybrid_analysis.ts',
    ),
  },
  // magic-string is a dependency of @analogjs/vite-plugin-angular
  external: ['@angular/compiler-cli', 'typescript', 'magic-string'],
  nodePaths: [resolve('node_modules')],
});
await copyFile(join(source, 'LICENSE'), join(output, 'LICENSE'));
await writeFile(
  join(output, 'build.json'),
  `${JSON.stringify({ revision, wasmBindgen: bindgenVersion }, null, 2)}\n`,
);
console.log(`NGP prepared in ${output}`);
