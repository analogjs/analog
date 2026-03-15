import { describe, expect, it } from 'vitest';

import {
  detectJsonLdModuleExports,
  extractMarkdownJsonLd,
  generateJsonLdManifestSource,
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
      '.analog/route-jsonld.gen.ts',
    );

    expect(source).toContain(
      "import * as routeModule0 from '../src/app/pages/article.page'",
    );
    expect(source).toContain("['/article'");
    expect(source).toContain(
      'routeModule0.routeJsonLd ?? routeModule0.routeMeta?.jsonLd',
    );
    expect(source).toContain("['/guides/intro'");
    expect(source).toContain('"headline":"Intro"');
  });
});
