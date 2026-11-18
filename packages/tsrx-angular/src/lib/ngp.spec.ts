import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import angular from '@analogjs/vite-plugin-angular';
import { createServer, normalizePath, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { tsrxAngular } from './plugin.js';

// Fixtures live inside the package so `@angular/core` resolves from them.
let root: string;
let server: ViteDevServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function write(name: string, text: string): void {
  mkdirSync(dirname(join(root, name)), { recursive: true });
  writeFileSync(join(root, name), text);
}

async function serve(
  files: Record<string, string>,
  { typeCheck = false, liveReload = false } = {},
): Promise<ViteDevServer> {
  root = normalizePath(mkdtempSync(join(import.meta.dirname, '.ngp-spec-')));
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'es2022',
        module: 'preserve',
        moduleResolution: 'bundler',
        skipLibCheck: true,
        types: [],
      },
      include: ['src/**/*.ts'],
    }),
  );
  for (const [name, text] of Object.entries(files)) {
    write(name, text);
  }
  if (liveReload) {
    // HMR is disabled under Vitest
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'development');
  }
  server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    plugins: [
      tsrxAngular({ types: false }),
      angular({
        compilation: 'ngp',
        jit: false,
        disableTypeChecking: !typeCheck,
        tsconfig: join(root, 'tsconfig.json'),
        liveReload,
      }),
    ],
  });
  return server;
}

/** Edits a file and runs the NGP plugin's hot update for it. */
async function update(name: string, text: string): Promise<void> {
  write(name, text);
  const plugin = server!.config.plugins.find(
    (p) => p.name === '@analogjs/vite-plugin-angular-ngp',
  )!;
  await (plugin.handleHotUpdate as any)({
    file: `${root}/${name}`,
    read: () => text,
    server,
    modules: [],
    timestamp: Date.now(),
  });
}

/** Fetches the update module of an edited component. */
async function requestUpdate(componentId: string): Promise<string> {
  const http = createHttpServer(server!.middlewares).listen(0);
  await once(http, 'listening');
  try {
    const { port } = http.address() as AddressInfo;
    const response = await fetch(
      `http://localhost:${port}/@ng/component?c=${componentId}&t=1`,
    );
    return response.text();
  } finally {
    http.close();
  }
}

const COUNTER = `import { input } from '@angular/core';

export function Counter() @{
  const step = input.required<number>();
  <button>{step()}</button>
}
`;

const APP = (binding: string) => `import { Component } from '@angular/core';
import { Counter } from './counter.tsrx';

@Component({ selector: 'app-root', imports: [Counter], template: '<Counter [step]="${binding}" />' })
export class App {}
`;

describe('TSRX with NGP', () => {
  it('compiles .tsrx modules and the components that import them', async () => {
    await serve({ 'src/counter.tsrx': COUNTER, 'src/app.ts': APP('2') });

    const counter = await server!.transformRequest('/src/counter.tsrx');
    expect(counter?.code).toContain('ɵɵdefineComponent');
    expect(counter?.code).toContain('selectors: [["Counter"]]');
    expect(counter?.map?.sources).toEqual(['counter.tsrx']);

    const app = await server!.transformRequest('/src/app.ts');
    expect(app?.code).toContain('dependencies: [Counter]');
  });

  it('compiles .tsrx modules that nothing imports', async () => {
    await serve({
      'src/about.page.tsrx': `export default function About() @{
  <p>About</p>
}
`,
    });

    const page = await server!.transformRequest('/src/about.page.tsrx');
    expect(page?.code).toContain('ɵɵdefineComponent');
  });

  it('lowers tags to the selectors of imported components', async () => {
    await serve({
      'src/badge.ts': `import { Component } from '@angular/core';

@Component({ selector: 'x-badge', template: '' })
export class Badge {}
`,
      'src/card.tsrx': `import { Badge } from './badge';
import { Counter } from './counter.tsrx';

export function Card() @{
  <>
    <Badge />
    <Counter step={1} />
  </>
}
`,
      'src/counter.tsrx': COUNTER,
    });

    const card = await server!.transformRequest('/src/card.tsrx');
    expect(card?.code).toContain('"x-badge"');
    expect(card?.code).toMatch(
      /dependencies: \[(Badge, Counter|Counter, Badge)\]/,
    );
  });

  it('lowers importers again when a component changes its selector', async () => {
    const child = (
      selector: string,
    ) => `import { Component } from '@angular/core';

export const ChildMeta = { selector: '${selector}' } satisfies Component;

export function Child() @{
  <p>Child</p>
}
`;
    await serve({
      'src/child.tsrx': child('x-child'),
      'src/parent.tsrx': `import { Child } from './child.tsrx';

export function Parent() @{
  <Child />
}
`,
    });
    expect(
      (await server!.transformRequest('/src/parent.tsrx'))?.code,
    ).toContain('"x-child"');

    await update('src/child.tsrx', child('y-child'));

    expect(
      (await server!.transformRequest('/src/parent.tsrx'))?.code,
    ).toContain('"y-child"');
  });

  it('ignores a transform of code older than the latest change', async () => {
    const child = (
      selector: string,
    ) => `import { Component } from '@angular/core';

export const ChildMeta = { selector: '${selector}' } satisfies Component;

export function Child() @{
  <p>Child</p>
}
`;
    await serve({
      'src/child.tsrx': child('x-child'),
      'src/parent.tsrx': `import { Child } from './child.tsrx';

export function Parent() @{
  <Child />
}
`,
    });
    await server!.transformRequest('/src/parent.tsrx');
    await update('src/child.tsrx', child('y-child'));

    // A transform that loaded the module before the edit, finishing after it
    const plugin = server!.config.plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular-ngp',
    )!;
    await (plugin.transform as any).call(
      {
        resolve: (id: string, importer: string) =>
          server!.pluginContainer.resolveId(id, importer),
        addWatchFile: () => undefined,
        error: (e: unknown) => {
          throw e;
        },
      },
      child('x-child'),
      `${root}/src/child.tsrx`,
    );

    expect(
      (await server!.transformRequest('/src/parent.tsrx'))?.code,
    ).toContain('"y-child"');
  });

  it('updates a component in place after a template change', async () => {
    const greeting = (text: string) => `export function Greeting() @{
  <p>{'${text}'}</p>
}
`;
    await serve(
      { 'src/greeting.tsrx': greeting('Before') },
      { liveReload: true },
    );
    const send = vi.spyOn(server!.ws, 'send');
    const { code } = (await server!.transformRequest('/src/greeting.tsrx'))!;
    const id = encodeURIComponent(`${root}/src/greeting.tsrx@Greeting`);
    expect(code).toContain(id);

    await update('src/greeting.tsrx', greeting('After'));

    expect(send).toHaveBeenCalledWith('angular:component-update', {
      id,
      timestamp: expect.any(Number),
    });
    expect(send).not.toHaveBeenCalledWith({ type: 'full-reload' });
    expect(await requestUpdate(id)).toContain('After');
  });

  it('reports lowering errors', async () => {
    await serve({
      'src/broken.tsrx': `export function Broken() @{
  @try { <p>Hi</p> }
}
`,
    });

    await expect(server!.transformRequest('/src/broken.tsrx')).rejects.toThrow(
      /broken\.tsrx:2:4 - Missing `@catch` or `@pending` after `@try`/,
    );
  });

  it('reports compile errors against the .tsrx module', async () => {
    await serve({
      'src/host.tsrx': `export function Host() @{
  <x-unknown />
}
`,
    });

    await expect(server!.transformRequest('/src/host.tsrx')).rejects.toThrow(
      /\/host\.tsrx: 'x-unknown' is not a known element/,
    );
  });

  it('reports type errors at .tsrx locations', async () => {
    await serve(
      {
        'src/counter.tsrx': `import { input } from '@angular/core';

export function Counter() @{
  const step = input.required<number>();
  <button>{step().nope}</button>
}
`,
        'src/app.ts': APP(`\\'two\\'`),
      },
      { typeCheck: true },
    );

    // The importer is checked first, before the .tsrx module is compiled.
    await expect(server!.transformRequest('/src/app.ts')).rejects.toThrow(
      /app\.ts:4:\d+ - error TS2322: Type 'string' is not assignable to type 'number'/,
    );
    await expect(server!.transformRequest('/src/counter.tsrx')).rejects.toThrow(
      /counter\.tsrx:5:19 - error TS2339: Property 'nope' does not exist on type 'number'/,
    );
  });
});
