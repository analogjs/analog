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
import { format } from 'prettier';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('generates declarations without editing application sources', () => {
    const root = fixture();
    const before = readFileSync(join(root, 'src/main.ts'), 'utf8');
    configure(root);
    const entry = readFileSync(join(root, 'src/main.ts'), 'utf8');
    expect(parseSync('main.ts', entry).errors).toEqual([]);
    expect(entry).toBe(before);
    const generated = readFileSync(
      join(root, 'src/routeTree.gen.d.ts'),
      'utf8',
    );
    expect(generated).toContain('"/users/[id]"');
    expect(generated).toContain('params: { id: string }');
    expect(parseSync('routeTree.gen.d.ts', generated).errors).toEqual([]);
    configure(root);
    expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toBe(entry);
  });
  it('does not require a conventional application entry', () => {
    const root = fixture();
    rmSync(join(root, 'src/main.ts'));
    expect(() => configure(root, 'build')).not.toThrow();
    expect(
      readFileSync(join(root, 'src/routeTree.gen.d.ts'), 'utf8'),
    ).toContain('interface AnalogRouteTable');
  });
  it('rejects runtime module output paths', () => {
    expect(() => typedRoutes({ outFile: 'src/routeTree.gen.ts' })).toThrow(
      'must end in .d.ts',
    );
  });
  it('does not infer coerced types from schema exports', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/app/pages/users.[id].page.ts'),
      'export const routeParamsSchema = someNumberSchema;',
    );
    configure(root);
    const generated = readFileSync(
      join(root, 'src/routeTree.gen.d.ts'),
      'utf8',
    );
    expect(generated).toContain('params: { id: string }');
    expect(generated).not.toContain('InferOutput');
  });
  it('supports custom output paths and a first production build', () => {
    const root = fixture();
    configure(root, 'build', { outFile: 'generated/routes.d.ts' });
    expect(readFileSync(join(root, 'generated/routes.d.ts'), 'utf8')).toContain(
      'interface AnalogRouteTable',
    );
    configure(root, 'build', { outFile: 'generated/routes.d.ts' });
  });
  it('allows production builds with grouped pages sharing a URL', () => {
    const root = fixture();
    for (const group of ['admin', 'user']) {
      mkdirSync(join(root, `src/app/pages/(${group})`));
      writeFileSync(
        join(root, `src/app/pages/(${group})/dashboard.page.ts`),
        'export default class Page {}',
      );
    }
    expect(() => configure(root, 'build')).not.toThrow();
  });
  it('preserves formatted declarations but rejects changed types', async () => {
    const root = fixture();
    configure(root);
    const outputPath = join(root, 'src/routeTree.gen.d.ts');
    const formatted = await format(readFileSync(outputPath, 'utf8'), {
      parser: 'typescript',
      singleQuote: true,
      semi: false,
      printWidth: 40,
    });
    writeFileSync(outputPath, formatted);
    expect(() => configure(root, 'build')).not.toThrow();
    configure(root);
    expect(readFileSync(outputPath, 'utf8')).toBe(formatted);
    writeFileSync(outputPath, formatted.replace('id: string', 'id: number'));
    expect(() => configure(root, 'build')).toThrow('Stale route file');
  });
  it('rejects stale production output without rewriting it', () => {
    const root = fixture();
    configure(root);
    const before = readFileSync(join(root, 'src/routeTree.gen.d.ts'), 'utf8');
    writeFileSync(
      join(root, 'src/app/pages/about.page.ts'),
      'export default class About {}',
    );
    expect(() => configure(root, 'build')).toThrow('Stale route file');
    expect(readFileSync(join(root, 'src/routeTree.gen.d.ts'), 'utf8')).toBe(
      before,
    );
    configure(root, 'build', { verifyOnBuild: false });
    expect(
      readFileSync(join(root, 'src/routeTree.gen.d.ts'), 'utf8'),
    ).toContain('"/about"');
  });
  it('regenerates for add and unlink events but excludes server handlers', () => {
    const root = fixture();
    const plugin = configure(root);
    const listeners = new Map<string, (path: string) => void>();
    if (typeof plugin.configureServer === 'function')
      plugin.configureServer.call(
        {} as never,
        {
          watcher: {
            add: vi.fn(),
            on: (event: string, fn: (path: string) => void) =>
              listeners.set(event, fn),
          },
        } as never,
      );
    const file = join(root, 'src/app/pages/about.page.ts');
    writeFileSync(file, 'export default class About {}');
    listeners.get('add')!(file);
    expect(
      readFileSync(join(root, 'src/routeTree.gen.d.ts'), 'utf8'),
    ).toContain('"/about"');
    rmSync(file);
    listeners.get('unlink')!(file);
    expect(
      readFileSync(join(root, 'src/routeTree.gen.d.ts'), 'utf8'),
    ).not.toContain('"/about"');
    listeners.get('add')!(join(root, 'src/server/routes/api.ts'));
    expect(
      readFileSync(join(root, 'src/routeTree.gen.d.ts'), 'utf8'),
    ).not.toContain('/api');
  });
});
