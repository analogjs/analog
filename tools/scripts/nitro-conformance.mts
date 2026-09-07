import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createBuilder, createServer, type UserConfig } from 'vite';
import { nitro } from 'nitro/vite';
import { analogNitroPlugin } from '../../packages/platform/dist/src/lib/nitro/analog-nitro-plugin.js';
import { serverModePlugin } from '../../packages/platform/dist/src/server-mode-plugin.js';
import standaloneNitro from '../../packages/vite-plugin-nitro/dist/src/index.js';

const cloudflare = process.argv.includes('--cloudflare');
const workspace = resolve(import.meta.dirname, '../..');
const cache = join(workspace, 'node_modules/.cache');
await mkdir(cache, { recursive: true });
const root = await mkdtemp(join(cache, 'analog-nitro-conformance-'));
const output = {
  dir: join(root, 'output'),
  publicDir: join(root, 'output/public'),
  serverDir: join(root, 'output/server'),
};
for (const dir of ['src/server/routes/api', 'src/app/pages', 'public'])
  await mkdir(join(root, dir), { recursive: true });
await writeFile(
  join(root, 'package.json'),
  JSON.stringify({ name: 'analog-nitro-conformance', type: 'module' }),
);
await writeFile(
  join(root, 'index.html'),
  '<!doctype html><html><body>client shell<script type="module" src="/src/main.js"></script></body></html>',
);
await writeFile(
  join(root, 'src/main.js'),
  'document.documentElement.dataset.hydrated="true";',
);
await writeFile(join(root, 'public/asset.txt'), 'public asset');
await writeFile(
  join(root, 'src/server/routes/api/session.get.ts'),
  `import { defineHandler } from 'nitro'; export default defineHandler(event => ({ cookie: event.req.headers.get('cookie') }));`,
);
await writeFile(
  join(root, 'src/app/pages/index.server.ts'),
  `export const load = () => ({ loaded: true }); export const action = () => { throw new Error('HEAD must never invoke an action'); };`,
);
await writeFile(
  join(root, 'src/main.server.ts'),
  `export default async (url, template, context) => {
  if (url.startsWith('/metadata')) return new Response('metadata', { status: 202, headers: [['set-cookie','one=1'], ['set-cookie','two=2']] });
  if (url.startsWith('/session')) return JSON.stringify(await context.fetch('/api/session'));
  return template.replace('client shell', 'server rendered');
};`,
);

function config(
  kind: 'native' | 'standalone',
  staticOutput = false,
): UserConfig {
  const options = {
    workspaceRoot: root,
    ssr: true,
    static: staticOutput,
    prerender: { routes: ['/'] },
  };
  const nitroOptions = {
    ...(cloudflare
      ? { preset: 'cloudflare-module', compatibilityDate: '2026-09-03' }
      : {}),
    output,
    prerender: { failOnError: true },
    routeRules: {
      '/client': { ssr: false },
      '/metadata': { headers: { 'x-rule': 'applied' } },
    },
  };
  return {
    root,
    configFile: false,
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: 0, fs: { allow: [workspace] } },
    plugins:
      kind === 'native'
        ? [
            analogNitroPlugin(options),
            ...serverModePlugin(),
            nitro(nitroOptions),
          ]
        : standaloneNitro(options, nitroOptions),
  };
}

const request = (url: string, options: RequestInit = {}) =>
  fetch(url, { ...options, signal: AbortSignal.timeout(20000) });

async function check(url: string, sessions: boolean) {
  assert.match(await (await request(url + '/client')).text(), /client shell/);
  assert.match(
    await (
      await request(url + '/dynamic', {
        headers: { 'x-analog-no-ssr': 'true' },
      })
    ).text(),
    /server rendered/,
  );
  const metadata = await request(url + '/metadata');
  assert.equal(metadata.status, 202, await metadata.clone().text());
  assert.deepEqual(metadata.headers.getSetCookie(), ['one=1', 'two=2']);
  assert.equal(await metadata.text(), 'metadata');
  assert.equal(
    await (await request(url + '/asset.txt')).text(),
    'public asset',
  );
  const page = await request(url + '/api/_analog/pages/index');
  assert.deepEqual(await page.json(), { loaded: true });
  assert.equal(
    (await request(url + '/api/_analog/pages/index', { method: 'HEAD' }))
      .status,
    200,
  );
  assert.equal(
    await (await request(url + '/metadata', { method: 'HEAD' })).text(),
    '',
  );
  if (sessions) {
    const values = await Promise.all(
      ['a=1', 'b=2'].map(async (cookie) => {
        const response = await request(url + '/session', {
          headers: { cookie },
        });
        return (await response.json()).cookie;
      }),
    );
    assert.deepEqual(values, ['a=1', 'b=2']);
  }
}

async function preview() {
  const child = spawn(process.execPath, [join(output.serverDir, 'index.mjs')], {
    cwd: output.dir,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (data) => {
    logs += data;
  });
  child.stderr.on('data', (data) => {
    logs += data;
  });
  for (let i = 0; i < 200; i++) {
    const match = logs.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (match) return { child, url: match[0] };
    if (child.exitCode !== null) throw new Error(logs);
    await delay(50);
  }
  child.kill();
  throw new Error(`Preview did not start: ${logs}`);
}

try {
  for (const kind of cloudflare
    ? (['native'] as const)
    : (['native', 'standalone'] as const)) {
    const server = await createServer(config(kind));
    try {
      await server.listen();
      const address = server.httpServer!.address() as { port: number };
      await check(`http://127.0.0.1:${address.port}`, kind === 'native');
      console.log(`${kind}: development HTTP checks passed`);
    } finally {
      await server.close();
    }

    for (const staticOutput of cloudflare ? [false] : [false, true]) {
      await rm(output.dir, { recursive: true, force: true });
      const builder = await createBuilder(config(kind, staticOutput));
      await builder.buildApp();
      assert.match(
        await readFile(join(output.publicDir, 'index.html'), 'utf8'),
        /server rendered/,
      );
      if (staticOutput) {
        assert.equal(
          (await readdir(output.serverDir).catch(() => [])).length,
          0,
        );
      } else if (cloudflare) {
        const { unstable_dev } = await import('wrangler');
        const worker = await unstable_dev(join(output.serverDir, 'index.mjs'), {
          config: join(output.serverDir, 'wrangler.json'),
          local: true,
          compatibilityDate: '2026-09-03',
          port: 0,
          experimental: { disableExperimentalWarning: true },
        });
        try {
          await check(`http://${worker.address}:${worker.port}`, true);
        } finally {
          await worker.stop();
        }
      } else {
        const { child, url } = await preview();
        try {
          await check(url, true);
        } finally {
          child.kill();
          await once(child, 'exit');
        }
      }
      console.log(
        `${kind}: ${staticOutput ? 'static' : 'server'} output checks passed`,
      );
    }
  }
  await rm(root, { recursive: true, force: true });
} catch (error) {
  console.error(`Fixture retained for diagnosis: ${root}`);
  throw error;
}
