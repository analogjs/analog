#!/usr/bin/env node
// Run through: pnpm exec nx run platform:streaming-smoke --runtime=all --angular=all
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, stripVTControlCharacters } from 'node:util';
import { execa, execaSync } from 'execa';
import { probeStreamingRuntime } from './streaming-runtime-probes.mjs';

const { values } = parseArgs({
  options: {
    runtime: { type: 'string', default: 'all' },
    angular: { type: 'string', default: 'all' },
  },
});
assert.ok(
  ['node', 'node-zone', 'bun', 'workerd', 'all'].includes(values.runtime),
);
assert.ok(['21', '22', 'all'].includes(values.angular));
const runtimes =
  values.runtime === 'all'
    ? ['node', 'node-zone', 'bun', 'workerd']
    : [values.runtime];
const majors = values.angular === 'all' ? ['21', '22'] : [values.angular];
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const version = (name) =>
  JSON.parse(
    readFileSync(join(workspace, 'node_modules', name, 'package.json'), 'utf8'),
  ).version;
const output = join(workspace, 'dist/streaming-runtime');
mkdirSync(output, { recursive: true });
const root = mkdtempSync(join(output, 'run-'));
const packed = {};
const artifacts = [];
for (const name of ['vite-plugin-angular', 'platform', 'router', 'content']) {
  const cwd = join(workspace, 'packages', name, 'dist');
  const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  const artifact = JSON.parse(
    execaSync(
      'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', root],
      { cwd },
    ).stdout,
  )[0];
  packed[manifest.name] = artifact.filename;
  artifacts.push({
    name: manifest.name,
    version: manifest.version,
    sha256: createHash('sha256')
      .update(readFileSync(join(root, artifact.filename)))
      .digest('hex'),
  });
}

function run(cwd, command, args, env = {}) {
  execaSync(command, args, {
    cwd,
    env: { CI: 'true', ...env },
    stdio: 'inherit',
    timeout: 180000,
  });
}

async function nodeHost(project, entry, runtime) {
  const child = execa(
    runtime === 'bun' ? 'bun' : process.execPath,
    runtime === 'node-zone' ? ['--import', 'zone.js/node', entry] : [entry],
    {
      cwd: project,
      env: {
        PORT: '0',
        NITRO_PORT: '0',
        HOST: '127.0.0.1',
        NITRO_HOST: '127.0.0.1',
      },
      reject: false,
      forceKillAfterDelay: 5000,
    },
  );
  try {
    const origin = await new Promise((resolveOrigin, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Server did not announce readiness')),
        15000,
      );
      let output = '';
      const capture = (chunk) => {
        output += stripVTControlCharacters(chunk.toString());
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolveOrigin(match[0]);
        }
      };
      child.stdout.on('data', capture);
      child.stderr.on('data', capture);
      child.then((result) => {
        clearTimeout(timer);
        reject(new Error(result.stderr));
      });
    });
    return {
      origin,
      close: async () => {
        child.kill('SIGTERM');
        await child;
      },
    };
  } catch (error) {
    child.kill('SIGTERM');
    await child;
    throw error;
  }
}

const results = [];
try {
  for (const major of majors) {
    const project = join(root, `angular-${major}`);
    cpSync(join(workspace, 'tools/fixtures/streaming-runtime'), project, {
      recursive: true,
    });
    const angular = major === '21' ? '21.0.0' : version('@angular/core');
    const deps = Object.fromEntries(
      [
        '@angular/common',
        '@angular/compiler',
        '@angular/core',
        '@angular/platform-browser',
        '@angular/platform-server',
        '@angular/router',
      ].map((name) => [name, angular]),
    );
    Object.assign(deps, {
      '@angular/compiler-cli': angular,
      '@angular/build': major === '21' ? '21.0.0' : version('@angular/build'),
      '@types/node': version('@types/node'),
      typescript: major === '21' ? '5.9.3' : version('typescript'),
      vite: major === '21' ? '7.0.0' : version('vite'),
      nitro: version('nitro'),
      rxjs: version('rxjs'),
    });
    const overrides = Object.fromEntries(
      Object.entries(packed).map(([name, file]) => [name, `file:../${file}`]),
    );
    Object.assign(deps, overrides);
    if (runtimes.includes('node-zone'))
      deps['zone.js'] = major === '21' ? '0.15.1' : version('zone.js');
    if (runtimes.includes('workerd')) deps.miniflare = '4.20260730.0';
    writeFileSync(
      join(project, 'package.json'),
      JSON.stringify(
        {
          name: 'analog-streaming-runtime-fixture',
          private: true,
          type: 'module',
          dependencies: deps,
          pnpm: { overrides },
        },
        null,
        2,
      ) + '\n',
    );
    for (const flag of ['--no-frozen-lockfile', '--frozen-lockfile'])
      run(project, 'pnpm', [
        'install',
        '--ignore-workspace',
        '--ignore-scripts',
        '--prefer-offline',
        flag,
      ]);

    let built;
    for (const runtime of runtimes) {
      const preset = runtime === 'workerd' ? 'workerd' : 'node';
      if (built !== preset) {
        run(project, 'pnpm', ['exec', 'vite', 'build'], {
          ANALOG_FIXTURE_PRESET: preset,
        });
        built = preset;
      }
      const directory = join(
        project,
        preset === 'workerd'
          ? existsSync(join(project, '.output/nitro.json'))
            ? '.output'
            : 'dist'
          : 'dist/analog',
      );
      const metadata = JSON.parse(
        readFileSync(join(directory, 'nitro.json'), 'utf8'),
      );
      assert.equal(
        metadata.preset,
        preset === 'workerd' ? 'cloudflare-module' : 'node-server',
      );
      const entry = resolve(directory, metadata.serverEntry);
      const publicDir = resolve(directory, metadata.publicDir);
      assert.ok(
        existsSync(entry),
        `Missing ${runtime} entry: ${relative(project, entry)}`,
      );
      assert.ok(
        !entry.startsWith(publicDir + sep),
        'Worker/server code must be outside the asset directory',
      );
      let host;
      if (runtime === 'workerd') {
        const requireProject = createRequire(join(project, 'package.json'));
        const { Miniflare } = await import(
          pathToFileURL(requireProject.resolve('miniflare')).href
        );
        const workerConfig = JSON.parse(
          readFileSync(join(dirname(entry), 'wrangler.json'), 'utf8'),
        );
        const mf = new Miniflare({
          modules: true,
          scriptPath: entry,
          modulesRoot: dirname(entry),
          compatibilityDate: workerConfig.compatibility_date,
          compatibilityFlags: workerConfig.compatibility_flags,
          host: '127.0.0.1',
          port: 0,
          cf: false,
          assets: {
            directory: publicDir,
            binding: 'ASSETS',
            routerConfig: { has_user_worker: true },
          },
        });
        try {
          host = { origin: (await mf.ready).origin, close: () => mf.dispose() };
        } catch (error) {
          await mf.dispose();
          throw error;
        }
      } else {
        host = await nodeHost(project, entry, runtime);
      }
      try {
        const result = await probeStreamingRuntime({
          origin: host.origin,
          publicDir,
          entry,
          entryURL: metadata.serverEntry,
          label: `${runtime}-${major}`,
        });
        results.push({
          ...result,
          angular,
          vite: deps.vite,
          typescript: deps.typescript,
          nitro: deps.nitro,
          runtimeVersion:
            runtime === 'bun'
              ? execaSync('bun', ['--version']).stdout.trim()
              : runtime.startsWith('node')
                ? process.version
                : JSON.parse(
                    readFileSync(
                      join(project, 'node_modules/miniflare/package.json'),
                      'utf8',
                    ),
                  ).dependencies.workerd,
          ...(runtime === 'workerd' ? { miniflare: deps.miniflare } : {}),
          ...(runtime === 'node-zone' ? { zone: deps['zone.js'] } : {}),
        });
        console.log(`${runtime}/Angular ${angular}: passed`);
      } finally {
        await host.close();
      }
    }
  }
} finally {
  writeFileSync(
    join(root, 'result.json'),
    JSON.stringify({ node: process.version, artifacts, results }, null, 2) +
      '\n',
  );
}
