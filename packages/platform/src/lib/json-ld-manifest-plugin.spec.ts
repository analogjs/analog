import { describe, expect, it } from 'vitest';

import {
  detectJsonLdModuleExports,
  extractMarkdownJsonLd,
  generateJsonLdManifestSource,
  type JsonLdManifestEntry,
} from './json-ld-manifest-plugin.js';

describe('json-ld-manifest-plugin helpers', () => {
  it('detects JSON-LD exports in route modules', () => {
    expect(
      detectJsonLdModuleExports(`
        export const routeJsonLd = {
          '@context': 'https://schema.org',
          '@type': 'Article',
        };
      `),
    ).toBe(true);

    expect(
      detectJsonLdModuleExports(`
        export const routeMeta = {
          title: 'About',
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
          },
        };
      `),
    ).toBe(true);

    expect(
      detectJsonLdModuleExports(`
        export const routeMeta = {
          title: 'About',
        };
      `),
    ).toBe(false);
  });

  it('extracts JSON-LD from markdown frontmatter', () => {
    const markdown = `---
title: Hello
jsonLd:
  "@context": https://schema.org
  "@type": Article
  headline: Hello Analog
---

Hello world
`;

    expect(extractMarkdownJsonLd(markdown)).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Hello Analog',
      },
    ]);
  });

  it('generates source for module and content manifest entries', () => {
    const source = generateJsonLdManifestSource(
      [
        {
          kind: 'module',
          routePath: '/article',
          sourceFile: '/src/app/pages/article.page.ts',
          importAlias: 'routeModule0',
        },
        {
          kind: 'content',
          routePath: '/guides/intro',
          sourceFile: '/src/content/guides/intro.md',
          jsonLd: [
            {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: 'Intro',
            },
          ],
        },
      ],
      'src/routeTree.gen.ts',
    );

    expect(source).toContain(
      "import * as routeModule0 from './app/pages/article.page'",
    );
    expect(source).toContain("['/article'");
    expect(source).toContain('resolveModuleJsonLd(routeModule0)');
    expect(source).toContain("['/guides/intro'");
    expect(source).toContain('"headline":"Intro"');
    expect(source).toContain(
      "import type { Graph, Thing, WithContext } from 'schema-dts'",
    );
    expect(source).toContain('AnalogJsonLdDocument');
  });

  it('does not detect non-exported routeJsonLd', () => {
    expect(
      detectJsonLdModuleExports(`
        const routeJsonLd = {
          '@context': 'https://schema.org',
          '@type': 'Article',
        };
      `),
    ).toBe(false);
  });

  it('does not detect routeMeta without jsonLd property', () => {
    expect(
      detectJsonLdModuleExports(`
        export const routeMeta = {
          title: 'About',
          meta: [{ name: 'description', content: 'test' }],
        };
      `),
    ).toBe(false);
  });

  it('detects routeJsonLd as a function export', () => {
    expect(
      detectJsonLdModuleExports(`
        export const routeJsonLd = (route) => ({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: route.params.name,
        });
      `),
    ).toBe(true);
  });

  it('extracts JSON-LD array from markdown frontmatter', () => {
    const markdown = `---
title: Multi
jsonLd:
  - "@context": https://schema.org
    "@type": WebSite
    name: Site
  - "@context": https://schema.org
    "@type": Organization
    name: Org
---

Content
`;

    const result = extractMarkdownJsonLd(markdown);
    expect(result).toHaveLength(2);
    expect(result[0]['@type']).toBe('WebSite');
    expect(result[1]['@type']).toBe('Organization');
  });

  it('returns empty array for markdown with no jsonLd in frontmatter', () => {
    expect(
      extractMarkdownJsonLd(`---
title: Hello
---

No JSON-LD here.
`),
    ).toEqual([]);
  });

  it('returns empty array for markdown with malformed frontmatter', () => {
    expect(extractMarkdownJsonLd('not valid yaml ---')).toEqual([]);
  });

  it('returns empty array when jsonLd frontmatter is a scalar', () => {
    expect(
      extractMarkdownJsonLd(`---
jsonLd: just a string
---

Hello
`),
    ).toEqual([]);
  });

  it('codegen resolveModuleJsonLd prefers routeMeta.jsonLd over routeJsonLd', () => {
    const source = generateJsonLdManifestSource(
      [
        {
          kind: 'module',
          routePath: '/test',
          sourceFile: '/src/app/pages/test.page.ts',
          importAlias: 'routeModule0',
        },
      ],
      'src/routeTree.gen.ts',
    );

    expect(source).toContain(
      'typedRouteModule.routeMeta?.jsonLd ?? typedRouteModule.routeJsonLd',
    );
    expect(source).not.toContain(
      'typedRouteModule.routeJsonLd ?? typedRouteModule.routeMeta?.jsonLd',
    );
  });

  it('generates correct import paths from nested outFile', () => {
    const source = generateJsonLdManifestSource(
      [
        {
          kind: 'module',
          routePath: '/deep',
          sourceFile: '/src/app/pages/deep/nested.page.ts',
          importAlias: 'routeModule0',
        },
      ],
      'src/generated/routes/routeTree.gen.ts',
    );

    expect(source).toContain(
      "import * as routeModule0 from '../../app/pages/deep/nested.page'",
    );
  });

  it('generates valid output when entries array is empty', () => {
    const source = generateJsonLdManifestSource([], 'src/routeTree.gen.ts');

    expect(source).toContain('export const routeJsonLdManifest = new Map');
    expect(source).toContain(']);');
    expect(source).not.toMatch(/import \* as routeModule/);
  });

  // ─── Heuristic detector: known false negatives ───

  it('does not detect re-exported routeJsonLd', () => {
    expect(
      detectJsonLdModuleExports(`export { routeJsonLd } from './data';`),
    ).toBe(false);
  });

  it('does not detect aliased export', () => {
    expect(
      detectJsonLdModuleExports(
        `export { something as routeJsonLd } from './data';`,
      ),
    ).toBe(false);
  });

  it('does not detect default export with jsonLd', () => {
    expect(
      detectJsonLdModuleExports(`
        export default {
          jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage' },
        };
      `),
    ).toBe(false);
  });

  it('does not detect indirect assignment to routeMeta', () => {
    expect(
      detectJsonLdModuleExports(`
        const data = { jsonLd: { '@context': 'https://schema.org' } };
        export const routeMeta = data;
      `),
    ).toBe(false);
  });

  // ─── Heuristic detector: known false positive risks ───

  it('false-positive: detects routeJsonLd in a comment', () => {
    expect(
      detectJsonLdModuleExports(`
        // export const routeJsonLd = { ... }
        export default class AboutPage {}
      `),
    ).toBe(true);
  });

  it('false-positive: detects unrelated jsonLd text after routeMeta', () => {
    expect(
      detectJsonLdModuleExports(`
        export const routeMeta = { title: 'About' };

        // jsonLd appears in a comment much later
      `),
    ).toBe(true);
  });

  it('includes AnalogJsonLdDocument type even with only content entries', () => {
    const source = generateJsonLdManifestSource(
      [
        {
          kind: 'content',
          routePath: '/blog/hello',
          sourceFile: '/src/content/blog/hello.md',
          jsonLd: [
            {
              '@context': 'https://schema.org',
              '@type': 'BlogPosting',
              headline: 'Hello',
            },
          ],
        },
      ],
      'src/routeTree.gen.ts',
    );

    expect(source).toContain(
      "import type { Graph, Thing, WithContext } from 'schema-dts'",
    );
    expect(source).toContain(
      'export type AnalogJsonLdDocument = WithContext<Thing> | Graph | Array<WithContext<Thing>>',
    );
    expect(source).toContain("['/blog/hello'");
    expect(source).toContain('"headline":"Hello"');
  });
});
