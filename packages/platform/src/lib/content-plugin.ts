import { Plugin, UserConfig, normalizePath } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';

import type { WithShikiHighlighterOptions } from './content/shiki/index.js';
import { MarkedContentHighlighter } from './content/marked/marked-content-highlighter.js';
import type { WithPrismHighlighterOptions } from './content/prism/index.js';
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
  options?: Options
): Plugin[] {
  const cache = new Map<string, Content>();

  let markedHighlighter: MarkedContentHighlighter;
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
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
      async config() {
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
      },
      async load(id) {
        if (!id.includes('analog-content-file=true')) {
          return;
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
          markedHighlighter
        );
        const mdContent = (await markedSetupService
          .getMarkedInstance()
          .parse(body)) as unknown as string;

        return `export default ${JSON.stringify(
          `---\n${frontmatter}\n---\n\n${mdContent}`
        )}`;
      },
    },
    {
      name: 'analog-content-glob-routes',
      config(_config) {
        config = _config;
        root = resolve(workspaceRoot, config.root || '.') || '.';
      },
      transform(code, id) {
        if (
          code.includes('ANALOG_CONTENT_FILE_LIST') &&
          code.includes('ANALOG_AGX_FILES') &&
          id.includes('analogjs')
        ) {
          const contentFilesList: string[] = fg.sync(
            [
              `${root}/src/content/**/*.md`,
              `${root}/src/content/**/*.agx`,
              ...(options?.additionalContentDirs || [])?.map(
                (glob) => `${workspaceRoot}${glob}/**/*.{md,agx}`
              ),
            ],
            { dot: true }
          );

          const eagerImports: string[] = [];

          contentFilesList.forEach((module, index) => {
            eagerImports.push(
              `import { default as analog_module_${index} } from "${module}?analog-content-list=true";`
            );
          });

          let result = code.replace(
            'let ANALOG_CONTENT_FILE_LIST = {};',
            `
            let ANALOG_CONTENT_FILE_LIST = {${contentFilesList.map(
              (module, index) =>
                `"${module.replace(root, '')}": analog_module_${index}`
            )}};
          `
          );

          const agxFiles: string[] = fg.sync(
            [
              `${root}/src/content/**/*.agx`,
              ...(options?.additionalContentDirs || [])?.map(
                (glob) => `${workspaceRoot}${glob}/**/*.agx`
              ),
            ],
            {
              dot: true,
            }
          );

          result = result.replace(
            'let ANALOG_AGX_FILES = {};',
            `
          let ANALOG_AGX_FILES = {${agxFiles.map(
            (module) =>
              `"${module.replace(root, '')}": () => import('${module}')`
          )}};
          `
          );

          return {
            code: `${eagerImports.join('\n')}\n${result}`,
            map: null,
          };
        }

        return;
      },
    },
    {
      name: 'analogjs-invalidate-content-dirs',
      configureServer(server) {
        function invalidateContent(path: string) {
          if (path.includes(normalizePath(`/src/content/`))) {
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
