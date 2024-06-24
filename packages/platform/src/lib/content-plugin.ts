import { Plugin } from 'vite';
import { readFileSync } from 'node:fs';

import { WithShikiHighlighterOptions } from './content/shiki/index.js';
import { MarkedContentHighlighter } from './content/marked/marked-content-highlighter.js';
import { WithPrismHighlighterOptions } from './content/prism/index.js';
import { WithMarkedOptions } from './content/marked/index.js';

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
  }
): Plugin[] {
  const cache = new Map<string, Content>();

  let markedHighlighter: MarkedContentHighlighter;

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
  ];
}
