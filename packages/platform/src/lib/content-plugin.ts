import type { Plugin, UserConfig } from 'vite';
import { normalizePath } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

import type { WithShikiHighlighterOptions } from './content/shiki/options.js';
import type { MarkedContentHighlighter } from './content/marked/marked-content-highlighter.js';
import type { WithPrismHighlighterOptions } from './content/prism/options.js';
import type { WithMarkedOptions } from './content/marked/index.js';
import type { Options } from './options.js';

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
  }: ContentPluginOptions = {
    highlighter: 'prism',
    markedOptions: { mangle: true },
  },
  options?: Options,
): Plugin[] {
  const cache = new Map<string, Content>();

  let markedHighlighter: MarkedContentHighlighter;
  const workspaceRoot = normalizePath(options?.workspaceRoot ?? process.cwd());
  let config: UserConfig;
  let root: string;

  return [
    {
      name: 'analogjs-content-frontmatter',
      async transform(code, id) {
        // Transform only the frontmatter into a JSON object for lists
        if (!id.includes('analog-content-list=true')) {
          return;
        }

        const cachedContent = cache.get(id);
        // There's no reason to run `readFileSync` and frontmatter parsing if the
        // `transform` hook is called with the same code. In such cases, we can simply
        // return the cached attributes, which is faster than repeatedly reading files
        // synchronously during the build process.
        if (cachedContent?.code === code) {
          return `export default ${cachedContent.attributes}`;
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

        return `export default ${content.attributes}`;
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
            const { getShikiHighlighter } = await import(
              './content/shiki/index.js'
            );
            markedHighlighter = getShikiHighlighter(shikiOptions);
          } else {
            const { getPrismHighlighter } = await import(
              './content/prism/index.js'
            );
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

            (loadLanguages as unknown as { default: Function }).default(langs);
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
        const { MarkedSetupService } = await import(
          './content/marked/marked-setup.service.js'
        );
        const markedSetupService = new MarkedSetupService(
          markedOptions,
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
    {
      name: 'analog-content-glob-routes',
      config(_config) {
        config = _config;
        root = normalizePath(resolve(workspaceRoot, config.root || '.') || '.');
      },
      transform(code) {
        if (
          code.includes('ANALOG_CONTENT_FILE_LIST') &&
          code.includes('ANALOG_AGX_FILES')
        ) {
          // Discover content files using tinyglobby
          // NOTE: { dot: true } returns relative paths from cwd, NOT absolute paths
          const contentFilesList: string[] = globSync(
            [
              `${root}/src/content/**/*.md`,
              `${root}/src/content/**/*.agx`,
              ...(options?.additionalContentDirs || []).map(
                (glob) => `${workspaceRoot}${glob}/**/*.{md,agx}`,
              ),
            ],
            { dot: true },
          );

          const eagerImports: string[] = [];

          contentFilesList.forEach((module, index) => {
            // CRITICAL: tinyglobby returns relative paths like "apps/blog-app/src/content/file.md"
            // These MUST be converted to absolute paths for ES module imports
            // Otherwise Node.js treats "apps" as a package name and throws "Cannot find package 'apps'"
            const absolutePath = module.startsWith('/')
              ? module
              : `${workspaceRoot}/${module}`;
            eagerImports.push(
              `import { default as analog_module_${index} } from "${absolutePath}?analog-content-list=true";`,
            );
          });

          let result = code.replace(
            'let ANALOG_CONTENT_FILE_LIST = {};',
            `
            let ANALOG_CONTENT_FILE_LIST = {${contentFilesList.map(
              (module, index) =>
                `"${module.replace(root, '')}": analog_module_${index}`,
            )}};
          `,
          );

          // Discover AGX files - same relative path behavior as above
          const agxFiles: string[] = globSync(
            [
              `${root}/src/content/**/*.agx`,
              ...(options?.additionalContentDirs || []).map(
                (glob) => `${workspaceRoot}${glob}/**/*.agx`,
              ),
            ],
            {
              dot: true,
            },
          );

          result = result.replace(
            'let ANALOG_AGX_FILES = {};',
            `
          let ANALOG_AGX_FILES = {${agxFiles.map(
            (module) =>
              `"${module.replace(root, '')}": () => import('${module}')`,
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
    {
      name: 'analogjs-invalidate-content-dirs',
      configureServer(server) {
        function invalidateContent(path: string) {
          if (path.includes(normalizePath(`/content/`))) {
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
}
