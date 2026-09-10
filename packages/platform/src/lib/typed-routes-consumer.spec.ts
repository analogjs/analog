import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NgtscProgram, readConfiguration } from '@angular/compiler-cli';
import angular from '@analogjs/vite-plugin-angular';
import ts from 'typescript';
import { resolveConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { typedRoutes } from './typed-routes-plugin.js';

describe('typed routing consumer integration', () => {
  const roots: string[] = [];
  afterEach(() =>
    roots
      .splice(0)
      .forEach((root) => rmSync(root, { recursive: true, force: true })),
  );

  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'analog-typed-consumer-'));
    roots.push(root);
    mkdirSync(join(root, 'src/app/pages'), { recursive: true });
    symlinkSync(
      resolve(import.meta.dirname, '../../../../node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    writeFileSync(join(root, 'src/main.ts'), "import './consumer';");
    writeFileSync(join(root, 'src/main.server.ts'), "import './consumer';");
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          types: [],
          noEmit: true,
        },
        angularCompilerOptions: { strictTemplates: true },
        include: ['src/**/*.d.ts'],
      }),
    );
    for (const [config, entry] of [
      ['browser', 'main'],
      ['server', 'main.server'],
    ]) {
      writeFileSync(
        join(root, `${config}.json`),
        JSON.stringify({
          extends: './tsconfig.json',
          files: [`src/${entry}.ts`],
        }),
      );
    }
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
    writeFileSync(
      join(root, 'src/consumer.ts'),
      `
      import { toRoute, injectNavigate, injectParams, injectQuery } from '@analogjs/router';
      toRoute('/about');
      toRoute('/users/[id]', { params: { id: '42' } });
      toRoute('/users/[id]', { params: { id: 0 } });
      toRoute('/docs/[...slug]', { params: { slug: ['a', 42] } });
      toRoute('/shop/[[...category]]', { params: { category: [0, 'shoes'] } });
      toRoute('/docs/[...slug]', { params: { slug: ['a/b'] } });
      toRoute('/shop/[[...category]]');
      const params = injectParams('/users/[id]');
      const id: string = params().id;
      const query = injectQuery('/users/[id]');
      const page: string | string[] | undefined = query()['page'];
      const navigate = injectNavigate();
      navigate('/about', { replaceUrl: true });
      navigate('/users/[id]', { params: { id: '42' } }, { replaceUrl: true });
      navigate('/users/[id]', { params: { id: 42 } });
      navigate('/docs/[...slug]', { params: { slug: [1, 'a'] } });
      // @ts-expect-error navigation params must be strings or numbers
      navigate('/users/[id]', { params: { id: false } });
      // @ts-expect-error catch-all entries must be strings or numbers
      toRoute('/docs/[...slug]', { params: { slug: [true] } });
      // @ts-expect-error unknown route
      toRoute('/missing');
      // @ts-expect-error required params
      toRoute('/users/[id]');
      // @ts-expect-error incorrect param name
      toRoute('/users/[id]', { params: { other: '42' } });
      // @ts-expect-error params must be strings or numbers
      toRoute('/users/[id]', { params: { id: true } });
      // @ts-expect-error catch-all requires an array
      toRoute('/docs/[...slug]', { params: { slug: 'a/b' } });
      // @ts-expect-error optional catch-all still requires an array when present
      toRoute('/shop/[[...category]]', { params: { category: 'shoes' } });
      // @ts-expect-error static route has no params
      toRoute('/about', { params: { id: '42' } });
      // @ts-expect-error signal params are strings
      const numericId: number = params().id;
      // @ts-expect-error query is not coerced
      const numericPage: number = query()['page'];
      // @ts-expect-error extras cannot replace required params
      navigate('/users/[id]', { replaceUrl: true });
      // @ts-expect-error undefined cannot replace required params
      navigate('/users/[id]', undefined, { replaceUrl: true });
      // @ts-expect-error signals also require a known route
      injectParams('/missing');
      // @ts-expect-error query helpers also require a known route
      injectQuery('/missing');
    `,
    );
    return root;
  }

  async function configure(
    root: string,
    config = 'browser.json',
    outFile?: string,
    fastCompile = false,
  ) {
    const plugin = typedRoutes({ workspaceRoot: root, outFile });
    await resolveConfig(
      {
        configFile: false,
        root,
        plugins: [
          plugin,
          angular({
            workspaceRoot: root,
            tsconfig: () => join(root, config),
            jit: false,
            fastCompile,
            disableTypeChecking: false,
          }),
        ],
      },
      'serve',
    );
    return plugin;
  }

  function compile(
    root: string,
    config = 'browser.json',
    previous?: NgtscProgram,
  ) {
    const { rootNames, options, errors } = readConfiguration(
      join(root, config),
    );
    expect(errors).toEqual([]);
    const program = new NgtscProgram(
      rootNames,
      options,
      ts.createCompilerHost(options),
      previous,
    );
    const diagnostics = [
      ...program.getTsOptionDiagnostics(),
      ...program.getTsSyntacticDiagnostics(),
      ...program.getTsSemanticDiagnostics(),
      ...program.getNgOptionDiagnostics(),
      ...program.getNgSemanticDiagnostics(),
    ];
    return {
      program,
      diagnostics,
      messages: diagnostics.map((d) =>
        ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      ),
    };
  }

  it.each(['browser.json', 'server.json'])(
    'checks public APIs through %s without consumer imports of the declaration',
    async (config) => {
      const root = fixture();
      await configure(root, config);
      const { program, messages } = compile(root, config);
      expect(messages).toEqual([]);
      expect(
        program
          .getTsProgram()
          .getSourceFile(join(root, 'src/routeTree.gen.d.ts')),
      ).toBeDefined();
      expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toBe(
        "import './consumer';",
      );
      expect(readFileSync(join(root, 'src/main.server.ts'), 'utf8')).toBe(
        "import './consumer';",
      );
    },
  );

  it('rejects typed helpers when the generated table is not in the program', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/consumer.ts'),
      `
      import { toRoute, injectNavigate, injectParams, injectQuery } from '@analogjs/router';
      // @ts-expect-error route declarations are missing
      toRoute('/about');
      // @ts-expect-error route declarations are missing
      injectNavigate()('/about');
      // @ts-expect-error route declarations are missing
      injectParams('/about');
      // @ts-expect-error route declarations are missing
      injectQuery('/about');
    `,
    );
    expect(compile(root).messages).toEqual([]);
  });

  it.each([false, true])(
    'reports missing inclusion in the selected tsconfig (fastCompile=%s)',
    async (fastCompile) => {
      const root = fixture();
      writeFileSync(
        join(root, 'server.json'),
        JSON.stringify({
          extends: './tsconfig.json',
          files: ['src/main.server.ts'],
          include: [],
        }),
      );
      await expect(
        configure(root, 'server.json', undefined, fastCompile),
      ).rejects.toThrow(/server.json.*Add "src\/routeTree.gen.d.ts"/);
    },
  );

  it('supports custom declaration paths through explicit files inclusion', async () => {
    const root = fixture();
    writeFileSync(
      join(root, 'browser.json'),
      JSON.stringify({
        extends: './tsconfig.json',
        files: ['src/main.ts', 'generated/routes.d.ts'],
        include: [],
      }),
    );
    await configure(root, 'browser.json', 'generated/routes.d.ts');
    expect(compile(root).messages).toEqual([]);
  });

  it.each([
    [
      'valid destinations',
      `<a [linkTo]="{ path: '/about' }"></a>
      <a [linkTo]="{ path: '/users/[id]', params: { id: '42' }, query: { tab: 'bio' }, hash: 'details' }" routerLinkActive="active"></a>
      <a [linkTo]="{ path: '/users/[id]', params: { id: 0 } }"></a>
      <a [linkTo]="{ path: '/docs/[...slug]', params: { slug: ['a/b', 42] } }"></a>
      <a [linkTo]="{ path: '/shop/[[...category]]' }"></a>
      <a [linkTo]="null"></a>`,
      false,
    ],
    ['unknown path', `<a [linkTo]="{ path: '/missing' }"></a>`, true],
    ['missing params', `<a [linkTo]="{ path: '/users/[id]' }"></a>`, true],
    [
      'wrong param name',
      `<a [linkTo]="{ path: '/users/[id]', params: { other: '42' } }"></a>`,
      true,
    ],
    [
      'wrong param type',
      `<a [linkTo]="{ path: '/users/[id]', params: { id: true } }"></a>`,
      true,
    ],
    [
      'catch-all string',
      `<a [linkTo]="{ path: '/docs/[...slug]', params: { slug: 'a/b' } }"></a>`,
      true,
    ],
    [
      'static route params',
      `<a [linkTo]="{ path: '/about', params: { id: '42' } }"></a>`,
      true,
    ],
  ])('checks LinkTo templates: %s', async (_name, template, invalid) => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/consumer.ts'),
      `
      import { Component } from '@angular/core';
      import { RouterLinkActive } from '@angular/router';
      import { LinkTo } from '@analogjs/router';
      @Component({ standalone: true, imports: [LinkTo, RouterLinkActive], template: \`${template}\` })
      export class Consumer {}
    `,
    );
    await configure(root);
    const messages = compile(root).messages;
    if (invalid) {
      expect(messages.join('\n')).toMatch(
        /not assignable|missing|does not exist/,
      );
    } else {
      expect(messages).toEqual([]);
      rmSync(join(root, 'src/routeTree.gen.d.ts'));
      expect(compile(root).messages.join('\n')).toContain('not assignable');
    }
  });

  it('checks typed route calls in Angular templates', async () => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/consumer.ts'),
      `
      import { Component } from '@angular/core';
      import { RouterLink } from '@angular/router';
      import { toRoute } from '@analogjs/router';
      @Component({
        standalone: true, imports: [RouterLink],
        template: \`<a [routerLink]="toRoute('/users/[id]', { params: { id: '42' } }).path">User</a>\`,
      })
      export class Consumer { toRoute = toRoute; }
    `,
    );
    await configure(root);
    expect(compile(root).messages).toEqual([]);
    const path = join(root, 'src/consumer.ts');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace("id: '42'", 'id: true'),
    );
    expect(compile(root).messages.join('\n')).toContain(
      "Type 'boolean' is not assignable to type 'string | number'",
    );
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        "'/users/[id]', { params: { id: true } }",
        "'/missing'",
      ),
    );
    expect(compile(root).messages.join('\n')).toContain('"/missing"');
  });

  it('updates compiler diagnostics after page add, rename, and removal', async () => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/consumer.ts'),
      "import { toRoute } from '@analogjs/router'; toRoute('/new');",
    );
    const plugin = await configure(root);
    let previous: NgtscProgram | undefined;
    const diagnostics = () => {
      const result = compile(root, 'browser.json', previous);
      previous = result.program;
      return result.messages;
    };
    const listeners = new Map<string, (path: string) => void>();
    if (typeof plugin.configureServer === 'function') {
      plugin.configureServer.call(
        {} as never,
        {
          watcher: {
            add: vi.fn(),
            on: (event: string, listener: (path: string) => void) =>
              listeners.set(event, listener),
          },
        } as never,
      );
    }
    expect(diagnostics().join('\n')).toContain('"/new"');
    const page = join(root, 'src/app/pages/new.page.ts');
    writeFileSync(page, 'export default class Page {}');
    listeners.get('add')!(page);
    expect(diagnostics()).toEqual([]);
    rmSync(page);
    listeners.get('unlink')!(page);
    const renamed = join(root, 'src/app/pages/renamed.page.ts');
    writeFileSync(renamed, 'export default class Page {}');
    listeners.get('add')!(renamed);
    expect(diagnostics().join('\n')).toContain('"/new"');
    writeFileSync(
      join(root, 'src/consumer.ts'),
      "import { toRoute } from '@analogjs/router'; toRoute('/renamed');",
    );
    expect(diagnostics()).toEqual([]);
    rmSync(renamed);
    listeners.get('unlink')!(renamed);
    expect(diagnostics().join('\n')).toContain('"/renamed"');
  }, 20_000);
});
