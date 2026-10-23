import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, open, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))(
  'esbuild',
);

const revision = '4e4ad75144e55538cedc65f0ac3ff5b68cb34ce9';
const output = resolve('node_modules/.cache/analog-ngp');
const source =
  process.env.NGP_SOURCE ?? (await mkdtemp(join(tmpdir(), 'analog-ngp-')));
await mkdir(output, { recursive: true });

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

execFileSync(
  'cargo',
  [
    '+1.95.0',
    'build',
    '--release',
    '--locked',
    '--features',
    'napi',
    '-p',
    'ng-analyze',
  ],
  {
    cwd: source,
    stdio: 'inherit',
  },
);
const library =
  process.platform === 'darwin'
    ? 'libng_analyze.dylib'
    : process.platform === 'win32'
      ? 'ng_analyze.dll'
      : 'libng_analyze.so';
await copyFile(
  join(source, 'target/release', library),
  join(output, 'analyzer.node'),
);

// NGP uses compiler APIs newer than the Angular version installed in Analog.
// Bundle its matching compiler from the same revision, without changing the app runtime.
await build({
  entryPoints: [join(source, 'packages/compiler-cli/preprocessor/api.ts')],
  outfile: join(output, 'api.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: {
    '@angular/compiler': join(source, 'packages/compiler/src/compiler.ts'),
  },
  external: ['@angular/compiler-cli', 'typescript'],
  nodePaths: [resolve('node_modules')],
});
await writeFile(
  join(output, 'build.json'),
  JSON.stringify({ revision, source }, null, 2),
);
console.log(`NGP prepared in ${output}`);
