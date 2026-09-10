import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSync } from 'oxc-parser';
import { afterEach, describe, expect, it } from 'vitest';
import { typedRoutes } from './typed-routes-plugin.js';

describe('typed route generation', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots
      .splice(0)
      .forEach((root) => rmSync(root, { recursive: true, force: true })),
  );
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'analog-typed-routes-'));
    roots.push(root);
    mkdirSync(join(root, 'src/app/pages'), { recursive: true });
    writeFileSync(
      join(root, 'src/main.ts'),
      "import {\n bootstrapApplication\n} from '@angular/platform-browser';\n",
    );
    writeFileSync(
      join(root, 'src/app/pages/users.[id].page.ts'),
      'export default class Page {}',
    );
    return root;
  }
  function configure(
    root: string,
    command: 'build' | 'serve' = 'serve',
    options = {},
  ) {
    const plugin = typedRoutes({ workspaceRoot: root, ...options });
    const hook = plugin.config;
    if (typeof hook === 'function')
      hook.call({} as never, { root }, { command, mode: 'development' });
    return plugin;
  }
  it('generates before compilation and preserves multiline entry imports', () => {
    const root = fixture();
    configure(root);
    const entry = readFileSync(join(root, 'src/main.ts'), 'utf8');
    expect(parseSync('main.ts', entry).errors).toEqual([]);
    expect(entry).toContain("import type {} from './routeTree.gen';");
    const generated = readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf8');
    expect(generated).toContain('"/users/[id]"');
    expect(generated).toContain('paramsOutput: { id: string }');
    expect(parseSync('routeTree.gen.ts', generated).errors).toEqual([]);
    configure(root);
    expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toBe(entry);
  });
  it('does not infer coerced types from schema exports', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/app/pages/users.[id].page.ts'),
      'export const routeParamsSchema = someNumberSchema;',
    );
    configure(root);
    const generated = readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf8');
    expect(generated).toContain('paramsOutput: { id: string }');
    expect(generated).not.toContain('InferOutput');
  });
  it('supports custom output paths and a first production build', () => {
    const root = fixture();
    configure(root, 'build', { outFile: 'generated/routes.ts' });
    expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toContain(
      "from '../generated/routes'",
    );
    configure(root, 'build', { outFile: 'generated/routes.ts' });
  });
  it('rejects stale production output without rewriting it', () => {
    const root = fixture();
    configure(root);
    const before = readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf8');
    writeFileSync(
      join(root, 'src/app/pages/about.page.ts'),
      'export default class About {}',
    );
    expect(() => configure(root, 'build')).toThrow('Stale route file');
    expect(readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf8')).toBe(
      before,
    );
    configure(root, 'build', { verifyOnBuild: false });
    expect(readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf8')).toContain(
      '"/about"',
    );
  });
  it('regenerates for add and unlink events but excludes server handlers', () => {
    const root = fixture();
    const plugin = configure(root);
    const listeners = new Map<string, (path: string) => void>();
    (plugin.configureServer as Function)({
      watcher: {
        on: (event: string, fn: (path: string) => void) =>
          listeners.set(event, fn),
      },
    });
    const file = join(root, 'src/app/pages/about.page.ts');
    writeFileSync(file, 'export default class About {}');
    listeners.get('add')!(file);
    expect(readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf8')).toContain(
      '"/about"',
    );
    rmSync(file);
    listeners.get('unlink')!(file);
    expect(
      readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf8'),
    ).not.toContain('"/about"');
    listeners.get('add')!(join(root, 'src/server/routes/api.ts'));
    expect(
      readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf8'),
    ).not.toContain('/api');
  });
});

import ts from 'typescript';
import { resolve } from 'node:path';

it('type-checks generated routes and rejects invalid paths, params, and navigation extras', () => {
  const root = mkdtempSync(join(tmpdir(), 'analog-route-types-'));
  try {
    mkdirSync(join(root, 'src/app/pages'), { recursive: true });
    writeFileSync(join(root, 'src/main.ts'), 'export {};');
    for (const page of [
      'about',
      'users.[id]',
      'docs.[...slug]',
      'shop.[[...category]]',
    ]) {
      writeFileSync(
        join(root, `src/app/pages/${page}.page.ts`),
        'export default class Page {}',
      );
    }
    const plugin = typedRoutes({ workspaceRoot: root });
    (plugin.config as Function).call({}, { root }, { command: 'serve' });
    const routerSource = resolve(
      import.meta.dirname,
      '../../../router/src/lib',
    );
    const fixture = join(root, 'src/check.ts');
    writeFileSync(
      fixture,
      `
      import './routeTree.gen';
      import { routePath, type RouteParamsOutput } from '@analogjs/router';
      import { injectNavigate } from '${normalizeImport(routerSource + '/inject-navigate')}';
      routePath('/about');
      routePath('/users/[id]', {params: {id: '42'}});
      routePath('/shop/[[...category]]');
      routePath('/docs/[...slug]', {params: {slug: ['a', 'b']}});
      const id: RouteParamsOutput<'/users/[id]'> = {id: '42'};
      // @ts-expect-error raw values are strings, not schema output numbers
      const invalidId: RouteParamsOutput<'/users/[id]'> = {id: 42};
      // @ts-expect-error unknown route
      routePath('/missing');
      // @ts-expect-error missing required options
      routePath('/users/[id]');
      // @ts-expect-error wrong parameter name
      routePath('/users/[id]', {params: {other: '42'}});
      // @ts-expect-error numeric parameter
      routePath('/users/[id]', {params: {id: 42}});
      const navigate = injectNavigate();
      navigate('/about', {replaceUrl: true});
      navigate('/users/[id]', {params: {id: '42'}}, {replaceUrl: true});
      // @ts-expect-error extras cannot replace required params
      navigate('/users/[id]', {replaceUrl: true});
      // @ts-expect-error undefined cannot replace required params
      navigate('/users/[id]', undefined, {replaceUrl: true});
    `,
    );
    const program = ts.createProgram([fixture], {
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: [],
      paths: { '@analogjs/router': [resolve(routerSource, 'route-path.ts')] },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(
      diagnostics.map((d) =>
        ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      ),
    ).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function normalizeImport(path: string): string {
  return path.replace(/\\/g, '/');
}
