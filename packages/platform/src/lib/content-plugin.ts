import * as vite from 'vite';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { globSync } from 'tinyglobby';

import type { WithShikiHighlighterOptions } from './content/shiki/options.js';
import type { MarkedContentHighlighter } from './content/marked/marked-content-highlighter.js';
import type { WithPrismHighlighterOptions } from './content/prism/options.js';
import type { WithMarkedOptions } from './content/marked/index.js';
import type { Options } from './options.js';
import { getBundleOptionsKey } from './utils/rolldown.js';

interface Content {
  code: string;
  attributes: string;
}

export type ContentPluginOptions = {
  highlighter?: 'shiki' | 'prism';
  markedOptions?: WithMarkedOptions;
  shikiOptions?: WithShikiHighlighterOptions;
  prismOptions?: WithPrismHighlighterOptions;
};

/**
 * Content plugin that provides markdown and content file processing for Analog.
 *
 * IMPORTANT: This plugin uses tinyglobby for file discovery.
 * Key pitfall with { dot: true }:
 * - Returns relative paths from cwd (e.g., "apps/blog-app/src/content/...")
 * - These paths CANNOT be used directly in ES module imports
 * - Relative paths without ./ or ../ are treated as package names
 * - Must convert to absolute paths for imports to work correctly
 */
export function contentPlugin(
  {
    highlighter,
    markedOptions,
    shikiOptions,
    prismOptions,
  }: ContentPluginOptions = {},
  options?: Options,
): vite.Plugin[] {
  const cache = new Map<string, Content>();
  // The content list placeholder can be transformed several times during serve.
  // Caching the discovered markdown paths keeps those repeat passes cheap.
  let contentFilesListCache: string[] | undefined;

  let markedHighlighter: MarkedContentHighlighter;
  const workspaceRoot = vite.normalizePath(
    options?.workspaceRoot ?? process.env['NX_WORKSPACE_ROOT'] ?? process.cwd(),
  );
  let config: vite.UserConfig;
  let root: string;
  // Keep discovery and invalidation aligned by deriving both from the same
  // normalized content roots. That way external content dirs participate in
  // cache busting exactly the same way they participate in glob discovery.
  // Initialized once in the `config` hook after `root` is resolved — all
  // inputs (`root`, `workspaceRoot`, `options`) are stable after that point.
  let contentRootDirs: string[];
  const normalizeContentDir = (dir: string) => {
    const normalized = vite.normalizePath(
      dir.startsWith('/')
        ? `${workspaceRoot}${dir}`
        : resolve(workspaceRoot, dir),
    );
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  };
  const initContentRootDirs = () => {
    contentRootDirs = [
      vite.normalizePath(`${root}/src/content`),
      ...(options?.additionalContentDirs || []).map(normalizeContentDir),
    ];
  };
  const discoverContentFilesList = () => {
    contentFilesListCache ??= globSync(
      contentRootDirs.map((dir) => `${dir}/**/*.md`),
      { dot: true },
    );

    return contentFilesListCache;
  };
  const resolveContentModulePath = (module: string) =>
    vite.normalizePath(
      module.startsWith('/') ? module : `${workspaceRoot}/${module}`,
    );
  const getContentModuleKey = (module: string) => {
    const absolutePath = resolveContentModulePath(module);
    const relativeToRoot = vite.normalizePath(relative(root, absolutePath));
    // `startsWith(root)` is not safe here because sibling directories such as
    // `/apps/my-app-tools` also start with `/apps/my-app`. A relative path only
    // represents in-app content when it stays within `root`.
    const isInApp =
      !relativeToRoot.startsWith('..') && !relativeToRoot.startsWith('/');

    // Both branches prepend `/` so generated keys are always absolute-
    // looking (`/src/content/...` for in-app, `/libs/shared/...` for
    // workspace-external). Downstream consumers like content-files-token
    // rely on the leading `/` for slug extraction regexes.
    return isInApp
      ? `/${relativeToRoot}`
      : `/${vite.normalizePath(relative(workspaceRoot, absolutePath))}`;
  };

  const contentDiscoveryPlugins: vite.Plugin[] = [
    {
      name: 'analog-content-glob-routes',
      config(_config) {
        config = _config;
        root = vite.normalizePath(
          resolve(workspaceRoot, config.root || '.') || '.',
        );
        initContentRootDirs();
      },
      // Vite 8 / Rolldown "filtered transform" — the `filter.code` string
      // tells the bundler to skip this handler entirely for modules whose
      // source does not contain the substring, avoiding unnecessary JS→Rust
      // round-trips.  The inner `code.includes()` guard is kept for Vite 7
      // compat where filters are not evaluated by the bundler.
      transform: {
        filter: {
          code: 'ANALOG_CONTENT_FILE_LIST',
        },
        handler(code) {
          if (code.includes('ANALOG_CONTENT_FILE_LIST')) {
            const contentFilesList = discoverContentFilesList();

            const eagerImports: string[] = [];

            contentFilesList.forEach((module, index) => {
              // CRITICAL: tinyglobby returns relative paths like "apps/blog-app/src/content/file.md"
              // These MUST be converted to absolute paths for ES module imports
              // Otherwise Node.js treats "apps" as a package name and throws "Cannot find package 'apps'"
              const absolutePath = resolveContentModulePath(module);
              eagerImports.push(
                `import { default as analog_module_${index} } from "${absolutePath}?analog-content-list=true";`,
              );
            });

            let result = code.replace(
              'const ANALOG_CONTENT_FILE_LIST = {};',
              `
              let ANALOG_CONTENT_FILE_LIST = {${contentFilesList.map(
                (module, index) =>
                  `"${getContentModuleKey(module)}": analog_module_${index}`,
              )}};
            `,
            );

            if (!code.includes('analog_module_')) {
              result = `${eagerImports.join('\n')}\n${result}`;
            }

            return {
              code: result,
              map: { mappings: '' },
            };
          }

          return;
        },
      },
    },
    {
      name: 'analogjs-invalidate-content-dirs',
      configureServer(server) {
        function invalidateContent(path: string) {
          const normalizedPath = vite.normalizePath(path);
          const isContentPath = contentRootDirs.some(
            (dir) =>
              normalizedPath === dir || normalizedPath.startsWith(`${dir}/`),
          );

          if (isContentPath) {
            // The file set only changes on add/remove because this watcher is
            // intentionally scoped to those events. Clear the list cache so the
            // next transform sees the updated directory contents.
            contentFilesListCache = undefined;
            server.moduleGraph.fileToModulesMap.forEach((mods) => {
              mods.forEach((mod) => {
                if (
                  mod.id?.includes('analogjs') &&
                  mod.id?.includes('content')
                ) {
                  server.moduleGraph.invalidateModule(mod);

                  mod.importers.forEach((imp) => {
                    server.moduleGraph.invalidateModule(imp);
                  });
                }
              });
            });

            server.ws.send('analog:debug-full-reload', {
              plugin: 'platform:content-plugin',
              reason: 'content-file-set-changed',
              path: normalizedPath,
            });
            server.ws.send({
              type: 'full-reload',
            });
          }
        }

        server.watcher.on('add', invalidateContent);
        server.watcher.on('unlink', invalidateContent);
      },
    },
  ];

  if (!highlighter) {
    return [
      {
        name: 'analogjs-external-content',
        config() {
          const bundleOptionsKey = getBundleOptionsKey();
          return {
            build: {
              [bundleOptionsKey]: {
                external: ['@analogjs/content'],
              },
            },
          };
        },
      },
      {
        name: 'analogjs-exclude-content-import',
        transform: {
          filter: {
            code: '@analogjs/content',
          },
          handler(code) {
            /**
             * Remove the package so it doesn't get
             * referenced when building for serverless
             * functions.
             */
            if (code.includes(`import('@analogjs/content')`)) {
              return {
                code: code.replace(
                  `import('@analogjs/content')`,
                  'Promise.resolve({})',
                ),
              };
            }

            return;
          },
        },
      },
      ...contentDiscoveryPlugins,
    ];
  }

  return [
    {
      name: 'analogjs-content-frontmatter',
      // Filter by module ID so only `?analog-content-list=true` virtual
      // imports enter the handler.  Returns `moduleSideEffects: false` so
      // Rolldown can tree-shake unused content list entries.
      transform: {
        filter: {
          id: /analog-content-list=true/,
        },
        async handler(code, id) {
          const cachedContent = cache.get(id);
          // There's no reason to run `readFileSync` and frontmatter parsing if the
          // `transform` hook is called with the same code. In such cases, we can simply
          // return the cached attributes, which is faster than repeatedly reading files
          // synchronously during the build process.
          if (cachedContent?.code === code) {
            return {
              code: `export default ${cachedContent.attributes}`,
              moduleSideEffects: false,
            };
          }

          const fm: any = await import('front-matter');
          // The `default` property will be available in CommonJS environment, for instance,
          // when running unit tests. It's safe to retrieve `default` first, since we still
          // fallback to the original implementation.
          const frontmatter = fm.default || fm;
          const fileContents = readFileSync(id.split('?')[0], 'utf8');
          const { attributes } = frontmatter(fileContents);
          const content = {
            code,
            attributes: JSON.stringify(attributes),
          };
          cache.set(id, content);

          return {
            code: `export default ${content.attributes}`,
            moduleSideEffects: false,
          };
        },
      },
    },
    {
      name: 'analogjs-content-file',
      enforce: 'post',
      async load(id) {
        if (!id.includes('analog-content-file=true')) {
          return;
        }

        if (!markedHighlighter) {
          if (highlighter === 'shiki') {
            const { getShikiHighlighter } =
              await import('./content/shiki/index.js');
            markedHighlighter = getShikiHighlighter(shikiOptions);
          } else {
            const { getPrismHighlighter } =
              await import('./content/prism/index.js');
            markedHighlighter = getPrismHighlighter();

            const langs = [
              'bash',
              'css',
              'javascript',
              'json',
              'markup',
              'typescript',
            ];

            if (
              Array.isArray(prismOptions?.additionalLangs) &&
              prismOptions?.additionalLangs?.length > 0
            ) {
              langs.push(...prismOptions.additionalLangs);
            }

            const loadLanguages = await import('prismjs/components/index.js');

            (
              loadLanguages as unknown as { default: (...args: any[]) => any }
            ).default(langs);
          }
        }

        const fm: any = await import('front-matter');
        // The `default` property will be available in CommonJS environment, for instance,
        // when running unit tests. It's safe to retrieve `default` first, since we still
        // fallback to the original implementation.
        const frontmatterFn = fm.default || fm;
        const fileContents = readFileSync(id.split('?')[0], 'utf8');
        const { body, frontmatter } = frontmatterFn(fileContents);

        // parse markdown and highlight
        const { getMarkedSetup } = await import('./content/marked/index.js');
        const markedSetupService = getMarkedSetup(
          { mangle: true, ...(markedOptions || {}) },
          markedHighlighter,
        );
        const mdContent = (await markedSetupService
          .getMarkedInstance()
          .parse(body)) as unknown as string;

        return `export default ${JSON.stringify(
          `---\n${frontmatter}\n---\n\n${mdContent}`,
        )}`;
      },
    },
    ...contentDiscoveryPlugins,
  ];
}
