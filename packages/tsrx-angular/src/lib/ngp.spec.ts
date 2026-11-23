import { once } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import angular from '@analogjs/vite-plugin-angular';
import { createServer, normalizePath, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { tsrxAngular } from './plugin.js';

// Fixtures live inside the package so `@angular/core` resolves from them.
let root: string;
let roots: string[] = [];
let server: ViteDevServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  roots = [];
  vi.unstubAllEnvs();
});

function write(name: string, text: string): void {
  mkdirSync(dirname(join(root, name)), { recursive: true });
  writeFileSync(join(root, name), text);
}

async function serve(
  files: Record<string, string>,
  { typeCheck = false, liveReload = false, hmr = true, symlinked = false } = {},
): Promise<ViteDevServer> {
  root = normalizePath(mkdtempSync(join(import.meta.dirname, '.ngp-spec-')));
  roots.push(root);
  if (symlinked) {
    // The project reached through a symlink, as in some workspaces
    symlinkSync(root, `${root}-link`, 'dir');
    root = `${root}-link`;
    roots.push(root);
  }
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
    server: { middlewareMode: true, ws: false, watch: null, hmr },
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

/** Edits a file and runs the plugins' file event and hot update for it, as Vite does. */
async function update(name: string, text: string): Promise<void> {
  write(name, text);
  await fileEvent(name, 'update');
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

/** Reports a file event to the plugins, as the dev server's watcher does. */
function fileEvent(
  name: string,
  event: 'create' | 'update' | 'delete',
): Promise<void> {
  return server!.environments.client.pluginContainer.watchChange(
    `${root}/${name}`,
    { event },
  );
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

const CHILD = (selector: string) => `import { Component } from '@angular/core';

export const ChildMeta = { selector: '${selector}' } satisfies Component;

export function Child() @{
  <p>Child</p>
}
`;

const PARENT = `import { Child } from './child.tsrx';

export function Parent() @{
  <Child />
}
`;

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

  it('lowers a module again once the module it was missing is added', async () => {
    await serve({
      'src/parent.tsrx': `import { Child } from './child.tsrx';

export function Parent() @{
  <Child />
}
`,
    });
    await expect(server!.transformRequest('/src/parent.tsrx')).rejects.toThrow(
      /selector of 'Child'/,
    );

    write('src/child.tsrx', `export function Child() @{\n  <p>Child</p>\n}\n`);
    await fileEvent('src/child.tsrx', 'create');

    await vi.waitFor(async () => {
      server!.moduleGraph.invalidateAll();
      expect(
        (await server!.transformRequest('/src/parent.tsrx'))?.code,
      ).toContain('"Child"');
    });
  });

  it('ignores a module removed before it could be read', async () => {
    await serve({ 'src/counter.tsrx': COUNTER, 'src/app.ts': APP('2') });
    await server!.transformRequest('/src/app.ts');

    await expect(fileEvent('src/gone.tsrx', 'create')).resolves.toBeUndefined();
  });

  it('compiles modules of a project reached through a symlink', async () => {
    await serve(
      { 'src/child.tsrx': CHILD('x-child'), 'src/parent.tsrx': PARENT },
      { symlinked: true },
    );
    expect(
      (await server!.transformRequest('/src/parent.tsrx'))?.code,
    ).toContain('"x-child"');

    await update('src/child.tsrx', CHILD('y-child'));

    expect(
      (await server!.transformRequest('/src/parent.tsrx'))?.code,
    ).toContain('"y-child"');
  });

  it('lowers importers again without HMR', async () => {
    await serve(
      { 'src/child.tsrx': CHILD('x-child'), 'src/parent.tsrx': PARENT },
      { hmr: false },
    );
    await server!.transformRequest('/src/parent.tsrx');

    write('src/child.tsrx', CHILD('y-child'));
    await fileEvent('src/child.tsrx', 'update');

    expect(
      (await server!.transformRequest('/src/parent.tsrx'))?.code,
    ).toContain('"y-child"');
  });

  it('compiles a module requested before its file event', async () => {
    await serve({ 'src/counter.tsrx': COUNTER });
    await server!.transformRequest('/src/counter.tsrx');

    write('src/later.tsrx', `export function Later() @{\n  <p>Later</p>\n}\n`);

    expect((await server!.transformRequest('/src/later.tsrx'))?.code).toContain(
      'ɵɵdefineComponent',
    );
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

  it('reports type errors for mismatched output and DOM event handlers', async () => {
    await serve(
      {
        'src/emitter.tsrx': `import { output } from '@angular/core';

export function Emitter() @{
  const changed = output<number>();
  <button onClick={() => changed.emit(1)}>Emit</button>
}
`,
        'src/bad.tsrx': `import { Emitter } from './emitter.tsrx';

function handle(e: MouseEvent): void;
function handle(e: KeyboardEvent): void;
function handle(e: MouseEvent | KeyboardEvent): void {
  console.log(e.type);
}

export function Bad() @{
  <div>
    <Emitter onChanged={(v: string) => console.log(v)} />
    <button onClick={(e: KeyboardEvent) => console.log(e)}>Click</button>
    <Emitter onChanged={handle} />
  </div>
}
`,
      },
      { typeCheck: true },
    );

    const err = await server!
      .transformRequest('/src/bad.tsrx')
      .then(() => null)
      .catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(err).toMatch(
      /bad\.tsrx:11:\d+ - error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'/,
    );
    expect(err).toMatch(
      /bad\.tsrx:12:\d+ - error TS(2345|2740): .*(PointerEvent|MouseEvent).*KeyboardEvent/,
    );
    expect(err).toMatch(/bad\.tsrx:13:\d+ - error TS(2345|2769):/);
  });

  it('type-checks valid event and output handlers under NGP', async () => {
    await serve(
      {
        'src/emitter.tsrx': `import { output } from '@angular/core';

export function Emitter() @{
  const changed = output<number>();
  <button onClick={() => changed.emit(1)}>Emit</button>
}
`,
        'src/valid.tsrx': `import { signal } from '@angular/core';
import { Emitter } from './emitter.tsrx';

function handleInteraction(e: MouseEvent): void;
function handleInteraction(e: KeyboardEvent): void;
function handleInteraction(e: MouseEvent | KeyboardEvent): void {
  console.log(e.type);
}

export function Valid() @{
  const count = signal(0);
  const flag = signal(false);
  const items = signal<{ id: number }[]>([]);
  const onMouse = (e: MouseEvent) => console.log(e.clientX);
  const onAny = (e: Event) => console.log(e.type);
  const pick = (id: number, e: MouseEvent) => console.log(id, e.clientX);
  const actions = {
    label: 'ok',
    handle(this: { label: string }, e: MouseEvent) {
      console.log(this.label, e.clientX);
    },
  };
  const maybeActions = signal<{ handle(e: MouseEvent): void } | undefined>(undefined);

  <div>
    <Emitter onChanged={() => count.update((c) => c + 1)} />
    <Emitter onChanged={(v: number) => count.set(v)} />
    <Emitter onChanged={(v?: number) => count.set(v ?? 0)} />
    <Emitter onChanged={(...args: number[]) => count.set(args.length)} />
    <Emitter onChanged={flag() ? () => count.set(0) : (v: number) => count.set(v)} />
    <button onClick={() => count.set(0)}>Reset</button>
    <button onClick={(e: Event) => console.log(e.type)}>Event</button>
    <button onClick={(e) => console.log(e.type)}>Unannotated</button>
    <button onClick={({ type }) => console.log(type)}>Destructured</button>
    <button onClick={(e = null) => console.log(e)}>Defaulted</button>
    <button onClick={(...args) => console.log(args.length)}>Rest</button>
    <button onClick={function(e) { console.log(e.type); }}>FnExpr</button>
    <button onClick={flag() ? onMouse : onAny}>Union</button>
    <button onClick={handleInteraction}>Overloaded click</button>
    <button onKeyDown={handleInteraction}>Overloaded keydown</button>
    <button onClick={actions.handle}>Member</button>
    <button onClick={actions['handle']}>Computed member</button>
    <button onClick={maybeActions()?.handle}>Optional member</button>
    <button onClick={maybeActions()?.['handle']}>Optional computed</button>
    @for (const item of items(); key item.id) {
      <>
        <button onClick={(e: MouseEvent) => pick(item.id, e)}>{item.id}</button>
        <button onClick={(e) => pick(item.id, e)}>{item.id}</button>
      </>
    }
  </div>
}
`,
      },
      { typeCheck: true },
    );

    const valid = await server!.transformRequest('/src/valid.tsrx');
    expect(valid?.code).toContain('ɵɵdefineComponent');
  });
});
