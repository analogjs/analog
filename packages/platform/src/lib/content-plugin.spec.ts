import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';

vi.mock('fs');
vi.mock('tinyglobby', () => ({
  globSync: vi.fn(() => []),
}));

import { globSync } from 'tinyglobby';
import { contentPlugin } from './content-plugin';

describe('content plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(globSync).mockReturnValue([]);
  });

  const [plugin] = contentPlugin({ highlighter: 'prism' });

  // In Vite 8+ the transform hook uses the filtered-transform shape:
  //   transform: { filter: { id: RegExp }, handler: Function }
  // We need to call the handler directly and also inspect the filter to
  // verify module-ID gating.
  const transformObj = plugin.transform as {
    filter: { id: RegExp };
    handler: (code: string, id: string) => any;
  };
  const transform = (code: string, id: string): any => {
    return transformObj.handler.call(plugin, code, id);
  };

  it('should have a filter that only matches analog-content-list modules', () => {
    // The filter.id regex gates which modules reach the handler.
    // Modules without `analog-content-list=true` in their ID should not match.
    expect(transformObj.filter.id.test('/src/content/post.md')).toBe(false);
    expect(
      transformObj.filter.id.test(
        '/src/content/post.md?analog-content-list=true',
      ),
    ).toBe(true);
  });

  it.skip('should cache parsed attributes if the code is the same', async () => {
    // Arrange
    const code =
      '---\n' +
      'title: My First Post\n' +
      'slug: 2022-12-27-my-first-post\n' +
      'description: My First Post Description\n' +
      '---\n' +
      '\n' +
      'Hello World\n';
    const id = '/src/content/post.md?analog-content-list=true';
    const readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(code);
    const result = {
      code: 'export default {"title":"My First Post","slug":"2022-12-27-my-first-post","description":"My First Post Description"}',
      moduleSideEffects: false,
    };
    // Act & Assert
    expect(await transform(code, id)).toEqual(result);
    expect(await transform(code, id)).toEqual(result);
    // Ensure the `readFileSync` has been called only once.
    expect(readFileSyncSpy).toBeCalledTimes(1);
  });

  describe('content discovery transform', () => {
    const workspaceRoot = '/home/user/workspace';
    const appRoot = `${workspaceRoot}/apps/my-app`;

    function getDiscoveryPlugins() {
      const plugins = contentPlugin({ highlighter: 'prism' }, {
        workspaceRoot,
        additionalContentDirs: ['/libs/shared/feature/src/content'],
      } as any);
      const transformPlugin = plugins.find(
        (p) => p.name === 'analog-content-glob-routes',
      )!;
      const invalidatePlugin = plugins.find(
        (p) => p.name === 'analogjs-invalidate-content-dirs',
      )!;
      (transformPlugin as any).config?.({ root: 'apps/my-app' });

      return {
        transform: (transformPlugin as any).transform as {
          handler: (code: string) => { code: string };
        },
        configureServer: invalidatePlugin.configureServer as (
          server: unknown,
        ) => void,
      };
    }

    function extractKeys(code: string): string[] {
      const matches = code.matchAll(/"([^"]+)":\s*analog_module_/g);
      return [...matches].map((match) => match[1]);
    }

    it('normalizes app content keys to root-relative paths', () => {
      vi.mocked(globSync).mockReturnValueOnce([
        `${appRoot}/src/content/post.md`,
      ]);

      const { transform } = getDiscoveryPlugins();
      const result = transform.handler('const ANALOG_CONTENT_FILE_LIST = {};');

      expect(extractKeys(result.code)).toEqual(['/src/content/post.md']);
      expect(result.code).toContain(
        `from "${appRoot}/src/content/post.md?analog-content-list=true"`,
      );
    });

    it('normalizes workspace content keys outside app root', () => {
      vi.mocked(globSync).mockReturnValueOnce([
        'libs/shared/feature/src/content/post.md',
      ]);

      const { transform } = getDiscoveryPlugins();
      const result = transform.handler('const ANALOG_CONTENT_FILE_LIST = {};');

      expect(extractKeys(result.code)).toEqual([
        '/libs/shared/feature/src/content/post.md',
      ]);
      expect(result.code).toContain(
        `from "${workspaceRoot}/libs/shared/feature/src/content/post.md?analog-content-list=true"`,
      );
    });

    it.each(['add', 'unlink'] as const)(
      'invalidates cached discovery results on %s events',
      (eventName) => {
        const on = vi.fn();
        const invalidateModule = vi.fn();
        const send = vi.fn();
        const server = {
          moduleGraph: {
            fileToModulesMap: new Map(),
            invalidateModule,
          },
          watcher: { on },
          ws: { send },
        };

        const { transform, configureServer } = getDiscoveryPlugins();
        configureServer(server);

        vi.mocked(globSync).mockReturnValueOnce([
          `${appRoot}/src/content/first.md`,
        ]);

        const firstResult = transform.handler(
          'const ANALOG_CONTENT_FILE_LIST = {};',
        );
        expect(extractKeys(firstResult.code)).toEqual([
          '/src/content/first.md',
        ]);
        expect(globSync).toHaveBeenCalledTimes(1);

        vi.mocked(globSync).mockReturnValueOnce([
          `${appRoot}/src/content/second.md`,
        ]);

        const secondResult = transform.handler(
          'const ANALOG_CONTENT_FILE_LIST = {};',
        );
        expect(extractKeys(secondResult.code)).toEqual([
          '/src/content/first.md',
        ]);
        expect(globSync).toHaveBeenCalledTimes(1);

        const handler = on.mock.calls.find(
          ([registeredEvent]) => registeredEvent === eventName,
        )?.[1];
        expect(handler).toBeTypeOf('function');

        handler(`${appRoot}/src/content/second.md`);

        const thirdResult = transform.handler(
          'const ANALOG_CONTENT_FILE_LIST = {};',
        );
        expect(extractKeys(thirdResult.code)).toEqual([
          '/src/content/second.md',
        ]);
        expect(globSync).toHaveBeenCalledTimes(2);
        expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
        expect(invalidateModule).not.toHaveBeenCalled();
      },
    );
  });
});
