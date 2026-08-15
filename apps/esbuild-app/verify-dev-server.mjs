/**
 * Asserts the dev server rebuilds and serves changes with no explicit
 * watch flags — the builder's own defaults must carry it. Temporarily
 * edits fixture sources and restores them on exit. Run with
 * `nx verify-dev-server esbuild-app`.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const port = 4276;
const base = `http://localhost:${port}`;
const appDir = new URL('.', import.meta.url).pathname;
const workspaceRoot = join(appDir, '../..');
const indexPage = join(appDir, 'src/app/pages/index.page.ts');
const tempPage = join(appDir, 'src/app/pages/dev-probe.page.ts');
const indexPageOriginal = readFileSync(indexPage, 'utf8');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const servedBundles = async () => {
  const main = await (await fetch(`${base}/main.js`)).text();
  const chunkNames = [...new Set(main.match(/chunk-[A-Z0-9]+\.js/g) ?? [])];
  const chunks = await Promise.all(
    chunkNames.map(async (name) => (await fetch(`${base}/${name}`)).text()),
  );
  return [main, ...chunks].join('\n');
};

const pollServed = async (marker, attempts = 30) => {
  for (let i = 0; i < attempts; i++) {
    await sleep(2000);
    try {
      if ((await servedBundles()).includes(marker)) return true;
    } catch {
      // Server mid-rebuild; retry.
    }
  }
  return false;
};

// detached so the whole process group (nx shim + node children) can be
// killed on cleanup — killing only the shim leaves the server running.
const server = spawn(
  join(workspaceRoot, 'node_modules/.bin/nx'),
  ['serve', 'esbuild-app', `--port=${port}`],
  { cwd: workspaceRoot, stdio: 'ignore', detached: true },
);

const checks = [];
try {
  let up = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base)).status === 200) {
        up = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await sleep(1500);
  }
  checks.push(['dev server starts and serves the app', up]);

  writeFileSync(
    indexPage,
    indexPageOriginal.replace('<h1>Home</h1>', '<h1>HomeDevEdit</h1>'),
  );
  checks.push([
    'file edit rebuilds and reaches the served bundles',
    await pollServed('HomeDevEdit'),
  ]);

  writeFileSync(
    tempPage,
    "import { Component } from '@angular/core';\n\n@Component({ template: '<h1>DevProbe</h1>' })\nexport default class DevProbePageComponent {}\n",
  );
  checks.push([
    'adding a page rebuilds and joins the served route map',
    await pollServed('dev-probe.page'),
  ]);

  let apiBody = '';
  try {
    apiBody = JSON.stringify(await (await fetch(`${base}/api/hello`)).json());
  } catch {
    // Leaves the check failing below.
  }
  checks.push([
    'api route serves through dev middleware',
    apiBody === '{"message":"Hello Analog"}',
  ]);
} finally {
  writeFileSync(indexPage, indexPageOriginal);
  rmSync(tempPage, { force: true });
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill();
  }
}

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}

console.log(
  `\n${checks.length - failed}/${checks.length} dev-server checks passed`,
);
process.exit(failed === 0 ? 0 : 1);
