import { Plugin } from 'vite';
import { readFileSync } from 'node:fs';

import {
  WithShikiHighlighterOptions,
  getShikiHighlighter,
} from './content/shiki/index.js';
import { getPrismHighlighter } from './content/prism/index.js';

interface Content {
  code: string;
  attributes: string;
}

export function contentPlugin(
  {
    highlighter,
    shikiOptions,
  }: {
    highlighter?: 'shiki' | 'prism';
    shikiOptions?: WithShikiHighlighterOptions;
  } = { highlighter: 'prism' }
): Plugin[] {
  const cache = new Map<string, Content>();

  const markedHighlighter =
    highlighter === 'shiki'
      ? getShikiHighlighter(shikiOptions)
      : getPrismHighlighter();

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

        const fm: any = await import('front-matter');
        // The `default` property will be available in CommonJS environment, for instance,
        // when running unit tests. It's safe to retrieve `default` first, since we still
        // fallback to the original implementation.
        const frontmatterFn = fm.default || fm;
        const fileContents = readFileSync(id.split('?')[0], 'utf8');
        const { body, frontmatter } = frontmatterFn(fileContents);

        // parse markdown and highlight
        const { MarkedSetupService } = await import(
          './content/marked-setup.service.js'
        );
        const markedSetupService = new MarkedSetupService(markedHighlighter);
        const mdContent = (await markedSetupService
          .getMarkedInstance()
          .parse(body)) as unknown as string;

        if (highlighter === 'prism') {
          return `export default ${JSON.stringify(fileContents)}`;
        } else {
          return `export default ${JSON.stringify(
            `---\n${frontmatter}\n---\n\n${mdContent}`
          )}`;
        }
      },
    },
  ];
}
