import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('tinyglobby', () => ({
  globSync: vi.fn(() => []),
}));

import { globSync } from 'tinyglobby';
import { routerPlugin } from './router-plugin.js';

describe('routerPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(globSync).mockReturnValue([]);
  });

  const configureServer = (options?: Parameters<typeof routerPlugin>[0]) => {
    const importer = { id: '/src/main.ts' };
    const pageImporter = { id: '/src/app/routes.ts' };
    const analogModule = {
      id: '/node_modules/@analogjs/router/fesm2022/router.mjs',
      importers: new Set([importer]),
    };
    const changedRouteModule = {
      id: '/src/app/pages/hot-added.page.ts',
      importers: new Set([pageImporter]),
    };
    const unrelatedModule = {
      id: '/src/app/pages/home.page.ts',
      importers: new Set(),
    };
    const invalidateModule = vi.fn();
    const getModulesByFile = vi.fn((path: string) =>
      path === '/src/app/pages/hot-added.page.ts'
        ? new Set([changedRouteModule])
        : undefined,
    );
    const send = vi.fn();
    const on = vi.fn();
    const server = {
      moduleGraph: {
        fileToModulesMap: new Map([
          ['/src/app/pages/example.page.ts', [analogModule, unrelatedModule]],
        ]),
        getModulesByFile,
        invalidateModule,
      },
      watcher: {
        on,
        add: vi.fn(),
      },
      ws: {
        send,
      },
    };

    const [plugin] = routerPlugin(options);
    const configureServer = plugin.configureServer as (server: unknown) => void;

    configureServer(server);

    return {
      analogModule,
      changedRouteModule,
      importer,
      pageImporter,
      getModulesByFile,
      invalidateModule,
      send,
      on,
    };
  };

  it('invalidates route modules without a full reload when a route file changes', () => {
    const {
      analogModule,
      changedRouteModule,
      importer,
      pageImporter,
      getModulesByFile,
      invalidateModule,
      send,
      on,
    } = configureServer();

    const changeHandler = on.mock.calls.find(
      ([eventName]) => eventName === 'change',
    )?.[1];

    expect(changeHandler).toBeTypeOf('function');

    changeHandler('/src/app/pages/hot-added.page.ts');

    expect(getModulesByFile).toHaveBeenCalledWith(
      '/src/app/pages/hot-added.page.ts',
    );
    expect(invalidateModule).toHaveBeenCalledWith(changedRouteModule);
    expect(invalidateModule).toHaveBeenCalledWith(pageImporter);
    expect(invalidateModule).not.toHaveBeenCalledWith(analogModule);
    expect(invalidateModule).not.toHaveBeenCalledWith(importer);
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps full reloads for hot-added route files', () => {
    const { analogModule, importer, invalidateModule, send, on } =
      configureServer();

    const addHandler = on.mock.calls.find(
      ([eventName]) => eventName === 'add',
    )?.[1];

    expect(addHandler).toBeTypeOf('function');

    addHandler('/src/app/pages/hot-added.page.ts');

    expect(invalidateModule).toHaveBeenCalledWith(analogModule);
    expect(invalidateModule).toHaveBeenCalledWith(importer);
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
  });

  it('ignores unrelated file changes', () => {
    const { invalidateModule, send, on } = configureServer();

    const changeHandler = on.mock.calls.find(
      ([eventName]) => eventName === 'change',
    )?.[1];

    changeHandler('/src/app/components/button.component.ts');

    expect(invalidateModule).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('invalidates additional page directories on add', () => {
    const workspaceRoot = '/home/user/workspace';
    const { invalidateModule, send, on } = configureServer({
      workspaceRoot,
      additionalPagesDirs: ['/libs/shared/feature/src/pages'],
    });

    const addHandler = on.mock.calls.find(
      ([eventName]) => eventName === 'add',
    )?.[1];

    expect(addHandler).toBeTypeOf('function');

    addHandler(`${workspaceRoot}/libs/shared/feature/src/pages/extra.page.ts`);

    expect(invalidateModule).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
  });

  it('invalidates additional content directories on unlink', () => {
    const workspaceRoot = '/home/user/workspace';
    const { invalidateModule, send, on } = configureServer({
      workspaceRoot,
      additionalContentDirs: ['/libs/shared/feature/src/content/'],
    });

    const unlinkHandler = on.mock.calls.find(
      ([eventName]) => eventName === 'unlink',
    )?.[1];

    expect(unlinkHandler).toBeTypeOf('function');

    unlinkHandler(`${workspaceRoot}/libs/shared/feature/src/content/post.md`);

    expect(invalidateModule).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
  });

  describe('transform - key normalization', () => {
    const workspaceRoot = '/home/user/workspace';
    const appRoot = `${workspaceRoot}/apps/my-app`;

    function getTransformPlugin(pluginName: string) {
      const plugins = routerPlugin({
        workspaceRoot,
        additionalPagesDirs: ['/libs/shared/feature/src/pages'],
        additionalContentDirs: ['/libs/shared/feature/src/content'],
      });
      const plugin = plugins.find((p) => p.name === pluginName)!;
      (plugin as any).config?.({ root: 'apps/my-app' });
      return (plugin as any).transform as {
        handler: (code: string) => { code: string };
      };
    }

    function extractKeys(code: string): string[] {
      const matches = code.matchAll(/"([^"]+)":\s*\(\)\s*=>/g);
      return [...matches].map((match) => match[1]);
    }

    it('normalizes route file keys within app root to root-relative paths', () => {
      vi.mocked(globSync)
        .mockReturnValueOnce([
          `${appRoot}/src/app/pages/home.page.ts`,
          `${appRoot}/src/app/routes/about.ts`,
        ])
        .mockReturnValueOnce([]);

      const transform = getTransformPlugin('analog-glob-routes');
      const result = transform.handler(
        'export let ANALOG_ROUTE_FILES = {}; export let ANALOG_CONTENT_ROUTE_FILES = {};',
      );

      const keys = extractKeys(result.code);
      expect(keys).toContain('/src/app/pages/home.page.ts');
      expect(keys).toContain('/src/app/routes/about.ts');
      keys.forEach((key) => {
        expect(key).not.toContain(workspaceRoot);
      });
    });

    it('normalizes route file keys outside app root to workspace-relative paths', () => {
      vi.mocked(globSync)
        .mockReturnValueOnce([
          `${workspaceRoot}/libs/shared/feature/src/pages/test.page.ts`,
        ])
        .mockReturnValueOnce([]);

      const transform = getTransformPlugin('analog-glob-routes');
      const result = transform.handler(
        'export let ANALOG_ROUTE_FILES = {}; export let ANALOG_CONTENT_ROUTE_FILES = {};',
      );

      const keys = extractKeys(result.code);
      expect(keys).toContain('/libs/shared/feature/src/pages/test.page.ts');
      keys.forEach((key) => {
        expect(key).not.toContain(workspaceRoot);
      });
    });

    it('does not treat sibling app paths as inside the app root', () => {
      vi.mocked(globSync)
        .mockReturnValueOnce([
          `${workspaceRoot}/apps/my-app-tools/src/app/pages/test.page.ts`,
        ])
        .mockReturnValueOnce([]);

      const transform = getTransformPlugin('analog-glob-routes');
      const result = transform.handler(
        'export let ANALOG_ROUTE_FILES = {}; export let ANALOG_CONTENT_ROUTE_FILES = {};',
      );

      const keys = extractKeys(result.code);
      expect(keys).toContain('/apps/my-app-tools/src/app/pages/test.page.ts');
      expect(keys).not.toContain('/-tools/src/app/pages/test.page.ts');
    });

    it('normalizes content route file keys outside app root', () => {
      vi.mocked(globSync)
        .mockReturnValueOnce([])
        .mockReturnValueOnce([
          `${workspaceRoot}/libs/shared/feature/src/content/post.md`,
        ]);

      const transform = getTransformPlugin('analog-glob-routes');
      const result = transform.handler(
        'export let ANALOG_ROUTE_FILES = {}; export let ANALOG_CONTENT_ROUTE_FILES = {};',
      );

      const keys = extractKeys(result.code);
      expect(keys).toContain('/libs/shared/feature/src/content/post.md');
      keys.forEach((key) => {
        expect(key).not.toContain(workspaceRoot);
      });
    });

    it('normalizes endpoint file keys outside app root', () => {
      vi.mocked(globSync).mockReturnValue([
        `${workspaceRoot}/libs/shared/feature/src/pages/test.server.ts`,
      ]);

      const transform = getTransformPlugin('analog-glob-endpoints');
      const result = transform.handler(
        'export let ANALOG_PAGE_ENDPOINTS = {};',
      );

      const keys = extractKeys(result.code);
      expect(keys).toContain('/libs/shared/feature/src/pages/test.server.ts');
      keys.forEach((key) => {
        expect(key).not.toContain(workspaceRoot);
      });
    });

    it('preserves absolute paths in import() specifiers for Vite resolution', () => {
      const absolutePath = `${workspaceRoot}/libs/shared/feature/src/pages/test.page.ts`;
      vi.mocked(globSync)
        .mockReturnValueOnce([absolutePath])
        .mockReturnValueOnce([]);

      const transform = getTransformPlugin('analog-glob-routes');
      const result = transform.handler(
        'export let ANALOG_ROUTE_FILES = {}; export let ANALOG_CONTENT_ROUTE_FILES = {};',
      );

      expect(result.code).toContain(`import('${absolutePath}')`);
    });

    it('reuses cached discovery results on change and invalidates them on add', () => {
      const plugins = routerPlugin({
        workspaceRoot,
      });
      const invalidatePlugin = plugins.find(
        (p) => p.name === 'analogjs-router-invalidate-routes',
      )!;
      const transformPlugin = plugins.find(
        (p) => p.name === 'analog-glob-routes',
      )!;
      (transformPlugin as any).config?.({ root: 'apps/my-app' });

      const on = vi.fn();
      const invalidateModule = vi.fn();
      const send = vi.fn();
      const server = {
        moduleGraph: {
          fileToModulesMap: new Map(),
          getModulesByFile: vi.fn(() => undefined),
          invalidateModule,
        },
        watcher: { on, add: vi.fn() },
        ws: { send },
      };

      (invalidatePlugin.configureServer as (server: unknown) => void)(server);

      vi.mocked(globSync)
        .mockReturnValueOnce([`${appRoot}/src/app/pages/first.page.ts`])
        .mockReturnValueOnce([]);

      const transform = (transformPlugin as any).transform as {
        handler: (code: string) => { code: string };
      };

      const firstResult = transform.handler(
        'export let ANALOG_ROUTE_FILES = {}; export let ANALOG_CONTENT_ROUTE_FILES = {};',
      );
      expect(extractKeys(firstResult.code)).toContain(
        '/src/app/pages/first.page.ts',
      );
      expect(globSync).toHaveBeenCalledTimes(2);

      vi.mocked(globSync)
        .mockReturnValueOnce([`${appRoot}/src/app/pages/second.page.ts`])
        .mockReturnValueOnce([]);

      const changeHandler = on.mock.calls.find(
        ([eventName]) => eventName === 'change',
      )?.[1];
      changeHandler('/src/app/pages/first.page.ts');

      const secondResult = transform.handler(
        'export let ANALOG_ROUTE_FILES = {}; export let ANALOG_CONTENT_ROUTE_FILES = {};',
      );
      expect(extractKeys(secondResult.code)).toContain(
        '/src/app/pages/first.page.ts',
      );
      expect(globSync).toHaveBeenCalledTimes(2);
      expect(send).not.toHaveBeenCalled();

      const addHandler = on.mock.calls.find(
        ([eventName]) => eventName === 'add',
      )?.[1];
      addHandler('/src/app/pages/second.page.ts');

      const thirdResult = transform.handler(
        'export let ANALOG_ROUTE_FILES = {}; export let ANALOG_CONTENT_ROUTE_FILES = {};',
      );
      expect(extractKeys(thirdResult.code)).toContain(
        '/src/app/pages/second.page.ts',
      );
      expect(globSync).toHaveBeenCalledTimes(4);
    });

    // Regression: the Rolldown transform filter used 'ANALOG_ROUTE_FILES' as
    // a substring pre-filter, assuming it matched 'ANALOG_CONTENT_ROUTE_FILES'.
    // It does not — they diverge at position 7 ('ANALOG_C...' vs 'ANALOG_R...').
    // When tsconfig path aliases resolve @analogjs/router and
    // @analogjs/router/content to separate source files, each variable lives
    // in its own module.  The old filter never matched the content module,
    // so ANALOG_CONTENT_ROUTE_FILES stayed empty — silently dropping all .md
    // page routes (/about, /contact, etc.) and causing NG04002 during prerender.
    it('transforms ANALOG_CONTENT_ROUTE_FILES in an isolated content module (no ANALOG_ROUTE_FILES present)', () => {
      vi.mocked(globSync).mockImplementation((patterns) => {
        const joinedPatterns = Array.isArray(patterns)
          ? patterns.join(' ')
          : String(patterns);

        if (joinedPatterns.includes('**/*.md')) {
          return [
            `${appRoot}/src/app/pages/about.md`,
            `${appRoot}/src/content/hello.md`,
          ];
        }

        return [];
      });

      const transform = getTransformPlugin('analog-glob-routes');

      // Simulate what happens when tsconfig aliases resolve
      // @analogjs/router/content to a separate source file that only
      // contains ANALOG_CONTENT_ROUTE_FILES (no ANALOG_ROUTE_FILES).
      const contentOnlyModule = 'export const ANALOG_CONTENT_ROUTE_FILES = {};';
      const result = transform.handler(contentOnlyModule);

      const keys = extractKeys(result.code);
      expect(keys).toContain('/src/app/pages/about.md');
      expect(keys).toContain('/src/content/hello.md');
      // The old filter ('ANALOG_ROUTE_FILES') would have skipped this module
      // entirely, leaving the empty {} untouched.
      expect(result.code).not.toContain('ANALOG_CONTENT_ROUTE_FILES = {};');
    });

    it('transforms ANALOG_ROUTE_FILES in an isolated page module (no ANALOG_CONTENT_ROUTE_FILES present)', () => {
      vi.mocked(globSync).mockImplementation((patterns) => {
        const joinedPatterns = Array.isArray(patterns)
          ? patterns.join(' ')
          : String(patterns);

        if (joinedPatterns.includes('**/*.page.ts')) {
          return [`${appRoot}/src/app/pages/home.page.ts`];
        }

        return [];
      });

      const transform = getTransformPlugin('analog-glob-routes');

      const pageOnlyModule = 'export const ANALOG_ROUTE_FILES = {};';
      const result = transform.handler(pageOnlyModule);

      const keys = extractKeys(result.code);
      expect(keys).toContain('/src/app/pages/home.page.ts');
      expect(result.code).not.toContain('ANALOG_ROUTE_FILES = {};');
    });
  });
});
