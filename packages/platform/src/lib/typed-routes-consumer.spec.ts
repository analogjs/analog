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

describe('typed routing consumer integration', { timeout: 20_000 }, () => {
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
      'index',
      'about',
      'settings.profile',
      '[tenant].dashboard',
      'users.[id]',
      'users.[id].posts.[postId]',
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
      import { toRoute, injectNavigate, injectParams, injectQuery, injectRouteData } from '@analogjs/router';
      toRoute('/about');
      toRoute('/users/[id]', { params: { id: '42' } });
      toRoute('/users/[id]', { params: { id: 0 } });
      toRoute('/docs/[...slug]', { params: { slug: ['a', 42] } });
      toRoute('/shop/[[...category]]', { params: { category: [] } });
      // @ts-expect-error required catch-all must have at least one segment
      toRoute('/docs/[...slug]', { params: { slug: [] } });
      const unnecessaryParams = { params: { id: 42 } };
      // @ts-expect-error static routes reject params even through variables
      toRoute('/about', unnecessaryParams);
      toRoute('/shop/[[...category]]', { params: { category: [0, 'shoes'] } });
      toRoute('/docs/[...slug]', { params: { slug: ['a/b'] } });
      toRoute('/shop/[[...category]]');
      const params = injectParams('/users/[id]');
      const id: string = params().id;
      const query = injectQuery('/users/[id]');
      const page: string | string[] | undefined = query()['page'];
      const untypedParams: Record<string, string | undefined> = injectParams()();
      const untypedQuery: Record<string, string | string[] | undefined> = injectQuery()();
      const untypedData: Record<string, unknown> = injectRouteData()();
      const navigate = injectNavigate();
      navigate('/about', { replaceUrl: true });
      navigate('/users/[id]', { params: { id: '42' } }, { replaceUrl: true });
      navigate('/users/[id]', { params: { id: 42 } });
      navigate('/about', { query: { q: 'x' } }, { queryParamsHandling: 'merge', preserveFragment: true });
      navigate('/about', { queryParamsHandling: 'preserve' });
      navigate('/about', { query: { page: 2, archived: true, tag: ['a', 1] } });
      navigate('/about', { query: { q: null } }, { queryParamsHandling: 'merge' });
      navigate('/docs/[...slug]', { params: { slug: [1, 'a'] } });
      // @ts-expect-error navigation also requires non-empty catch-all params
      navigate('/docs/[...slug]', { params: { slug: [] } });
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
      // @ts-expect-error untyped params may be missing
      const untypedId: string = injectParams()()['id'];
      // @ts-expect-error typed query replaces queryParams
      navigate('/about', undefined, { queryParams: { q: 'x' } });
      // @ts-expect-error query values are strings, numbers, or booleans
      toRoute('/about', { query: { since: new Date() } });
      // @ts-expect-error functional updaters need injectNavigate(from)
      navigate('/users/[id]', { params: () => ({ id: '42' }) });
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
      import { toRoute, injectNavigate, injectParams, injectQuery, injectRouteData } from '@analogjs/router';
      // @ts-expect-error route declarations are missing
      toRoute('/about');
      // @ts-expect-error route declarations are missing
      injectNavigate()('/about');
      // @ts-expect-error route declarations are missing
      injectParams('/about');
      // @ts-expect-error route declarations are missing
      injectQuery('/about');
      injectParams();
      injectQuery();
      injectRouteData();
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

  it('types route data, resolver results, and load results from page and layout modules', async () => {
    const root = fixture();
    const pages = join(root, 'src/app/pages');
    writeFileSync(
      join(pages, 'users.[id].page.ts'),
      `
      import type { ResolveFn } from '@angular/router';
      import type { RouteMeta } from '@analogjs/router';
      import { resource } from '@angular/core';
      import { of } from 'rxjs';
      const profile: ResolveFn<{ bio: string }> = () => ({ bio: 'hi' });
      export const routeMeta = {
        data: { section: 'users' as const, count: 1, total: 'static' },
        resolve: {
          greeting: () => Promise.resolve('hello'),
          tags: () => of(['a', 'b']),
          total: () => 42,
          profile,
          load: () => 'shadowed',
        },
        resources: () => ({
          feed: resource({ loader: async () => ({ items: ['a', 'b'] }) }),
        }),
      } satisfies RouteMeta;
      export default class Page {}
    `,
    );
    writeFileSync(
      join(pages, 'users.[id].server.ts'),
      "export const load = async () => ({ user: { name: 'Ada' }, visits: 3 });",
    );
    writeFileSync(
      join(pages, 'about.page.ts'),
      `
      import type { RouteMeta } from '@analogjs/router';
      export const routeMeta: RouteMeta = { data: { title: 'About' } };
      export default class Page {}
    `,
    );
    mkdirSync(join(pages, 'blog'));
    writeFileSync(
      join(pages, 'blog.page.ts'),
      `
      import { resource } from '@angular/core';
      export const routeMeta = {
        data: { title: 'Blog', section: 'blog' as const },
        resolve: { nav: () => ['home'] },
        resources: () => ({
          theme: resource({ loader: async () => 'dark' }),
        }),
      };
      export default class Layout {}
    `,
    );
    writeFileSync(
      join(pages, 'blog.server.ts'),
      'export const load = async () => ({ layoutOnly: true });',
    );
    writeFileSync(
      join(pages, 'blog/index.page.ts'),
      "export const routeMeta = { data: { title: 'Posts' } };\nexport default class Page {}",
    );
    writeFileSync(
      join(pages, 'blog/[slug].page.ts'),
      `
      import { resource } from '@angular/core';
      export const routeMeta = {
        data: { section: 'post' as const },
        resources: () => ({
          likes: resource({ loader: async () => 10 }),
        }),
      };
      export default class Page {}
    `,
    );
    writeFileSync(
      join(root, 'src/consumer.ts'),
      `
      import { injectLoad, injectResources, injectRouteData } from '@analogjs/router';
      import type { ResourceRef } from '@angular/core';
      import type { load } from './app/pages/users.[id].server';
      const data = injectRouteData('/users/[id]');
      const section: 'users' = data().section;
      const count: number = data().count;
      const greeting: string = data().greeting;
      const tags: string[] = data().tags;
      const total: number = data().total;
      const bio: string = data().profile.bio;
      const name: string = data().load.user.name;
      injectLoad('/users/[id]').subscribe((result) => {
        const visits: number = result.visits;
      });
      injectLoad<typeof load>().subscribe((result) => {
        const visits: number = result.visits;
      });
      const title: unknown = injectRouteData('/about')()['title'];
      const post = injectRouteData('/blog/[slug]');
      const postTitle: string = post().title;
      const postSection: 'post' = post().section;
      const nav: string[] = post().nav;

      const userRes = injectResources('/users/[id]');
      const feedRes: ResourceRef<{ items: string[] } | undefined> = userRes.feed;
      const feedItems: string[] | undefined = userRes.feed.value()?.items;

      const blogRes = injectResources('/blog/[slug]');
      const likesRes: ResourceRef<number | undefined> = blogRes.likes;
      // @ts-expect-error layout resources are not inherited by child routes
      blogRes.theme;

      // @ts-expect-error unknown resource key is rejected
      userRes.missing;
      // @ts-expect-error wrong resource value type is rejected
      const invalidFeed: number = userRes.feed.value();

      // @ts-expect-error unknown data keys are rejected
      data().missing;
      // @ts-expect-error the server load result replaces resolve.load
      const shadowed: string = data().load;
      // @ts-expect-error annotated RouteMeta data values are unknown
      const titleString: string = injectRouteData('/about')()['title'];
      // @ts-expect-error routes without a server load are rejected
      injectLoad('/about');
      // @ts-expect-error page data overrides layout data
      const blogSection: 'blog' = post().section;
      // @ts-expect-error layout load results are not inherited
      post().load;
      // @ts-expect-error a layout and its index page share /blog, so it has no typed data keys
      injectRouteData('/blog')().title;
      // @ts-expect-error shared URLs have no typed load either
      injectLoad('/blog');
      // @ts-expect-error data helpers require a known route
      injectRouteData('/missing');
    `,
    );
    await configure(root);
    const declaration = readFileSync(
      join(root, 'src/routeTree.gen.d.ts'),
      'utf8',
    );
    expect(declaration).toContain(
      `routeMeta: typeof import("./app/pages/users.[id].page").routeMeta;`,
    );
    expect(declaration).toContain(
      `load: typeof import("./app/pages/users.[id].server").load;`,
    );
    expect(declaration).toContain(
      `layoutRouteMeta: [typeof import("./app/pages/blog.page").routeMeta];`,
    );
    expect(compile(root).messages).toEqual([]);
  });

  it('checks scoped navigation targets and inherited params', async () => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/consumer.ts'),
      `
      import { injectNavigate } from '@analogjs/router';
      const fromUser = injectNavigate('/users/[id]');
      fromUser('.');
      fromUser('.', { params: { id: 43 } }, { replaceUrl: true });
      fromUser('.', { replaceUrl: true });
      fromUser('./posts/[postId]', { params: { postId: 7 } });
      fromUser('../..', { query: { ref: 'user' } });
      fromUser('../../about');
      fromUser('/users/[id]/posts/[postId]', { params: { postId: 7 } });
      fromUser('/about');
      const fromPost = injectNavigate('/users/[id]/posts/[postId]');
      fromPost('../..');
      fromPost('.', { params: { postId: 8 } });
      injectNavigate('/')('./settings/profile');
      injectNavigate('/docs/[...slug]')('.');
      injectNavigate('/[tenant]/dashboard')('.');
      // @ts-expect-error params not shared with the current route are required
      fromUser('./posts/[postId]');
      // @ts-expect-error params are not inherited after the paths diverge
      fromUser('/[tenant]/dashboard');
      // @ts-expect-error relative targets must be routes
      fromUser('./missing');
      // @ts-expect-error there is no /users route
      fromUser('..');
      // @ts-expect-error relative paths start with ./ or ../
      fromUser('posts/[postId]', { params: { postId: 7 } });
      // @ts-expect-error each target has one relative form, via the nearest shared ancestor
      fromUser('../[id]');
      // @ts-expect-error inherited params keep their types
      fromUser('.', { params: { id: true } });
      // @ts-expect-error static targets reject params
      fromUser('../../about', { params: { id: 1 } });
      // @ts-expect-error scoped navigation requires a known route
      injectNavigate('/missing');
      fromUser('.', { params: (prev) => ({ id: Number(prev.id) + 1 }) });
      fromUser('./posts/[postId]', { params: (prev) => ({ postId: prev.id }) });
      fromUser('.', { query: (prev) => ({ ...prev, tab: 'bio' }) }, { queryParamsHandling: 'merge' });
      fromPost('.', { params: ({ id, postId }) => ({ id, postId: Number(postId) + 1 }) });
      // @ts-expect-error updater results are checked against the target's params
      fromUser('./posts/[postId]', { params: (prev) => ({ id: prev.id }) });
      // @ts-expect-error prev holds the current route's params
      fromUser('.', { params: (prev) => ({ id: prev.postId }) });
      fromUser('.', { query: (prev) => ({ ...prev, page: 2 }) });
      // @ts-expect-error updated query values are still checked
      fromUser('.', { query: (prev) => ({ ...prev, since: new Date() }) });
    `,
    );
    await configure(root);
    expect(compile(root).messages).toEqual([]);
  });

  it.each([
    [
      'valid destinations',
      `<a linkTo="/"></a>
      <a linkTo="/about"></a>
      <a [linkTo]="'/settings/profile'"></a>
      <a [linkTo]="{ path: '/about' }"></a>
      <a [linkTo]="{ path: '/users/[id]', params: { id: '42' }, query: { tab: 'bio' }, hash: 'details' }" routerLinkActive="active"></a>
      <a [linkTo]="{ path: '/about', query: { page: 2, archived: true } }"></a>
      <a [linkTo]="{ path: '/users/[id]', params: { id: 0 } }"></a>
      <a [linkTo]="{ path: '/docs/[...slug]', params: { slug: ['a/b', 42] } }"></a>
      <a [linkTo]="{ path: '/shop/[[...category]]' }"></a>
      <a [linkTo]="{ path: '/shop/[[...category]]', params: { category: [] } }"></a>
      <a [linkTo]="{ path: '/users/[id]/posts/[postId]', params: { id: 42, postId: 7 } }"></a>
      <a [linkTo]="destination"></a>
      <a [linkTo]="null"></a>`,
      false,
    ],
    [
      'valid scoped destinations',
      `<a from="/users/[id]" linkTo="."></a>
      <a from="/users/[id]" linkTo="../../about"></a>
      <a from="/users/[id]" [linkTo]="{ path: '.', params: { id: 43 }, query: { tab: 'bio' } }"></a>
      <a from="/users/[id]" [linkTo]="{ path: './posts/[postId]', params: { postId: 7 } }" routerLinkActive="active"></a>
      <a from="/users/[id]" [linkTo]="{ path: '/users/[id]/posts/[postId]', params: { postId: 7 } }"></a>
      <a from="/users/[id]" linkTo="/about"></a>
      <a from="/users/[id]/posts/[postId]" linkTo="../.."></a>
      <a from="/docs/[...slug]" linkTo="."></a>
      <a [from]="'/users/[id]'" [linkTo]="null"></a>`,
      false,
    ],
    [
      'scoped target missing unshared params',
      `<a from="/users/[id]" linkTo="./posts/[postId]"></a>`,
      true,
    ],
    [
      'scoped target params after divergence',
      `<a from="/users/[id]" [linkTo]="{ path: '/[tenant]/dashboard' }"></a>`,
      true,
    ],
    [
      'unknown relative target',
      `<a from="/users/[id]" linkTo="./missing"></a>`,
      true,
    ],
    ['missing parent route', `<a from="/users/[id]" linkTo=".."></a>`, true],
    [
      'wrong inherited param type',
      `<a from="/users/[id]" [linkTo]="{ path: '.', params: { id: true } }"></a>`,
      true,
    ],
    ['unknown scope', `<a from="/missing" linkTo="/about"></a>`, true],
    ['relative target without scope', `<a linkTo="."></a>`, true],
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
    ['unknown static path', `<a linkTo="/missing"></a>`, true],
    ['dynamic path string', `<a linkTo="/users/[id]"></a>`, true],
    ['resolved dynamic string', `<a linkTo="/users/42"></a>`, true],
    ['catch-all string path', `<a linkTo="/docs/[...slug]"></a>`, true],
    [
      'optional catch-all string path',
      `<a linkTo="/shop/[[...category]]"></a>`,
      true,
    ],
    ['unrestricted string', `<a [linkTo]="uncheckedPath"></a>`, true],
    ['positional commands', `<a [linkTo]="['/users', 42]"></a>`, true],
    [
      'missing nested param',
      `<a [linkTo]="{ path: '/users/[id]/posts/[postId]', params: { id: 42 } }"></a>`,
      true,
    ],
    [
      'extra param',
      `<a [linkTo]="{ path: '/users/[id]', params: { id: 42, postId: 7 } }"></a>`,
      true,
    ],
    [
      'empty required catch-all',
      `<a [linkTo]="{ path: '/docs/[...slug]', params: { slug: [] } }"></a>`,
      true,
    ],
    [
      'wrong query value',
      `<a [linkTo]="{ path: '/users/[id]', params: { id: 42 }, query: { tab: { id: 1 } } }"></a>`,
      true,
    ],
    [
      'wrong fragment value',
      `<a [linkTo]="{ path: '/about', hash: 42 }"></a>`,
      true,
    ],
    [
      'separate query override',
      `<a [linkTo]="{ path: '/about' }" [queryParams]="{ tab: true }"></a>`,
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
      export class Consumer {
        readonly destination = { path: '/users/[id]', params: { id: 42 } } as const;
        readonly uncheckedPath: string = '/about';
      }
    `,
    );
    await configure(root);
    const messages = compile(root).messages;
    if (invalid) {
      expect(messages.join('\n')).toMatch(
        /not assignable|missing|does not exist|isn't a known property/,
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
