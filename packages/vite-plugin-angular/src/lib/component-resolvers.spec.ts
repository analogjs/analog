import { describe, it, expect } from 'vitest';

import {
  getAngularComponentMetadata,
  getInlineTemplates,
  StyleUrlsResolver,
  TemplateUrlsResolver,
} from './component-resolvers';
import { normalizePath } from 'vite';
import type { ResourceLocation } from './component-resolvers';

interface CustomMatchers<R = unknown> {
  toMatchNormalizedPaths: (expected: readonly ResourceLocation[]) => R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface
  interface Assertion<T = any> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
  toMatchNormalizedPaths(
    actual: readonly ResourceLocation[],
    expected: readonly ResourceLocation[],
  ) {
    const normalized = actual.map(({ relativePath, absolutePath }) => ({
      relativePath,
      absolutePath: normalizePath(absolutePath).replace(/^[A-Z]:/i, ''),
    }));
    return {
      pass: this.equals(normalized, expected),
      message: () =>
        this.utils.diff(expected, normalized) ?? 'Resource paths match',
    };
  },
});

describe('component-resolvers', () => {
  const id = '/path/to/src/app.component.ts';

  describe('matcher', () => {
    it('should handle single line styleUrls', () => {
      const code = `
        @Component({
          styleUrls: ['./app.component.css']
        })
        export class MyComponent {}
      `;

      const expectedPaths = [
        {
          relativePath: './app.component.css',
          absolutePath: '/path/to/src/app.component.css',
        },
      ];
      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(resolvedPaths).toMatchNormalizedPaths(expectedPaths);
    });

    it('should handle single line styleUrl', () => {
      const code = `
        @Component({
          styleUrl: './app.component.css'
        })
        export class MyComponent {}
      `;

      const expectedPaths = [
        {
          relativePath: './app.component.css',
          absolutePath: '/path/to/src/app.component.css',
        },
      ];
      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(resolvedPaths).toMatchNormalizedPaths(expectedPaths);
    });

    it('should handle multi-line styleUrls', () => {
      const code = `
        @Component({
          styleUrls: [
            './app.component.css',
            '../styles.css'
          ]
        })
        export class MyComponent {}
      `;

      const expectedPaths = [
        {
          relativePath: './app.component.css',
          absolutePath: '/path/to/src/app.component.css',
        },
        { relativePath: '../styles.css', absolutePath: '/path/to/styles.css' },
      ];

      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(resolvedPaths).toMatchNormalizedPaths(expectedPaths);
    });

    it('should handle wrapped multi-line styleUrls', () => {
      const code = `
        @Component({
          styleUrls: [
            './app.component.css', './another.css',
            '../styles.css'
          ]
        })
        export class MyComponent {}
      `;

      const expectedPaths = [
        {
          relativePath: './app.component.css',
          absolutePath: '/path/to/src/app.component.css',
        },
        {
          relativePath: './another.css',
          absolutePath: '/path/to/src/another.css',
        },
        { relativePath: '../styles.css', absolutePath: '/path/to/styles.css' },
      ];

      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(resolvedPaths).toMatchNormalizedPaths(expectedPaths);
    });

    it('should handle styleUrls with route params in filename', () => {
      const code = `
        @Component({
          styleUrls: ['./[param].component.css']
        })
        export class MyComponent {}
      `;

      const expectedPaths = [
        {
          relativePath: './[param].component.css',
          absolutePath: '/path/to/src/[param].component.css',
        },
      ];
      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(resolvedPaths).toMatchNormalizedPaths(expectedPaths);
    });

    it('should handle styleUrl with backticks', () => {
      const code = `
      @Component({
        styleUrl: \`./app.component.css\`
      })
      export class MyComponent {}
    `;

      const expectedPaths = [
        {
          relativePath: './app.component.css',
          absolutePath: '/path/to/src/app.component.css',
        },
      ];
      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(resolvedPaths).toMatchNormalizedPaths(expectedPaths);
    });

    it('should handle multi-line styleUrls with backticks', () => {
      const code = `
        @Component({
          styleUrls: [
            \`./app.component.css\`,
            \`../styles.css\`
          ]
        })
        export class MyComponent {}
      `;

      const expectedPaths = [
        {
          relativePath: './app.component.css',
          absolutePath: '/path/to/src/app.component.css',
        },
        { relativePath: '../styles.css', absolutePath: '/path/to/styles.css' },
      ];

      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(resolvedPaths).toMatchNormalizedPaths(expectedPaths);
    });

    it('should handle multi-line styleUrls with backticks and single quotes', () => {
      const code = `
        @Component({
          styleUrls: [
            \`./app.component.css\`,
            '../styles.css'
          ]
        })
        export class MyComponent {}
      `;

      const expectedPaths = [
        {
          relativePath: './app.component.css',
          absolutePath: '/path/to/src/app.component.css',
        },
        { relativePath: '../styles.css', absolutePath: '/path/to/styles.css' },
      ];

      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(resolvedPaths).toMatchNormalizedPaths(expectedPaths);
    });

    it('should handle wrapped multi-line styleUrls with backticks', () => {
      const code = `
        @Component({
          styleUrls: [
            \`./app.component.css\`, \`./another.css\`,
            \`../styles.css\`
          ]
        })
        export class MyComponent {}
      `;

      const expectedPaths = [
        {
          relativePath: './app.component.css',
          absolutePath: '/path/to/src/app.component.css',
        },
        {
          relativePath: './another.css',
          absolutePath: '/path/to/src/another.css',
        },
        { relativePath: '../styles.css', absolutePath: '/path/to/styles.css' },
      ];

      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(resolvedPaths).toMatchNormalizedPaths(expectedPaths);
    });

    it('should ignore style urls that are not static strings', () => {
      const code = `
        @Component({
          styleUrl: STYLE_URL,
          styleUrls: [\`./\${name}.css\`]
        })
        export class MyComponent {}
      `;

      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(resolvedPaths).toHaveLength(0);
    });
  });

  describe('caching', () => {
    it('should return the cached style urls for identical code', () => {
      const code = `
        @Component({
          styleUrls: ['./app.component.css']
        })
        export class MyComponent {}
      `;

      const styleUrlsResolver = new StyleUrlsResolver();
      const first = styleUrlsResolver.resolve(code, id);
      const second = styleUrlsResolver.resolve(code, id);

      expect(second).toBe(first);
    });

    it('should re-resolve style urls when the code changes', () => {
      const styleUrlsResolver = new StyleUrlsResolver();
      const first = styleUrlsResolver.resolve(
        `
        @Component({
          styleUrls: ['./app.component.css']
        })
        export class MyComponent {}
      `,
        id,
      );
      const second = styleUrlsResolver.resolve(
        `
        @Component({
          styleUrls: ['./other.component.css']
        })
        export class MyComponent {}
      `,
        id,
      );

      expect(first).toMatchNormalizedPaths([
        {
          relativePath: './app.component.css',
          absolutePath: '/path/to/src/app.component.css',
        },
      ]);
      expect(second).toMatchNormalizedPaths([
        {
          relativePath: './other.component.css',
          absolutePath: '/path/to/src/other.component.css',
        },
      ]);
    });

    it('should return the cached template urls for identical code', () => {
      const code = `
        @Component({
          templateUrl: './app.component.html'
        })
        export class MyComponent {}
      `;

      const templateUrlsResolver = new TemplateUrlsResolver();
      const first = templateUrlsResolver.resolve(code, id);
      const second = templateUrlsResolver.resolve(code, id);

      expect(second).toBe(first);
    });

    it('should resolve template and style urls from the same code', () => {
      const code = `
        @Component({
          templateUrl: './app.component.html',
          styleUrls: ['./app.component.css']
        })
        export class MyComponent {}
      `;

      const templateUrls = new TemplateUrlsResolver().resolve(code, id);
      const styleUrls = new StyleUrlsResolver().resolve(code, id);

      expect(templateUrls).toMatchNormalizedPaths([
        {
          relativePath: './app.component.html',
          absolutePath: '/path/to/src/app.component.html',
        },
      ]);
      expect(styleUrls).toMatchNormalizedPaths([
        {
          relativePath: './app.component.css',
          absolutePath: '/path/to/src/app.component.css',
        },
      ]);
    });
  });

  describe('component-resolvers templateUrl', () => {
    const id = '/path/to/src/app.component.ts';

    describe('matcher', () => {
      it('should handle templateUrls with single quotes', () => {
        const code = `
        @Component({
          templateUrl: './app.component.html'
        })
        export class MyComponent {}
      `;

        const expectedUrl = {
          relativePath: './app.component.html',
          absolutePath: '/path/to/src/app.component.html',
        };
        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(resolvedTemplateUrls).toMatchNormalizedPaths([expectedUrl]);
      });

      it('should handle templateUrls with single quotes and route params', () => {
        const code = `
        @Component({
          templateUrl: './[param].component.html'
        })
        export class MyComponent {}
      `;

        const expectedUrl = {
          relativePath: './[param].component.html',
          absolutePath: '/path/to/src/[param].component.html',
        };
        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(resolvedTemplateUrls).toMatchNormalizedPaths([expectedUrl]);
      });

      it('should handle templateUrls with double quotes', () => {
        const code = `
        @Component({
          templateUrl: "./app.component.html"
        })
        export class MyComponent {}
      `;

        const expectedUrl = {
          relativePath: './app.component.html',
          absolutePath: '/path/to/src/app.component.html',
        };
        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(resolvedTemplateUrls).toMatchNormalizedPaths([expectedUrl]);
      });

      it('should handle templateUrls with double quotes and route params', () => {
        const code = `
        @Component({
          templateUrl: "./[param].component.html"
        })
        export class MyComponent {}
      `;

        const expectedUrl = {
          relativePath: './[param].component.html',
          absolutePath: '/path/to/src/[param].component.html',
        };
        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(resolvedTemplateUrls).toMatchNormalizedPaths([expectedUrl]);
      });

      it('should handle multiple templateUrls in a single file', () => {
        const code = `
        @Component({
          templateUrl: "./app.component.html"
        })
        export class MyComponent {}

        @Component({
          templateUrl: "./app1.component.html"
        })
        export class MyComponentTwo {}
      `;

        const expectedUrl1 = {
          relativePath: './app.component.html',
          absolutePath: '/path/to/src/app.component.html',
        };
        const expectedUrl2 = {
          relativePath: './app1.component.html',
          absolutePath: '/path/to/src/app1.component.html',
        };
        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(resolvedTemplateUrls).toMatchNormalizedPaths([
          expectedUrl1,
          expectedUrl2,
        ]);
      });

      it('should ignore commented out templateUrls', () => {
        const code = `
        @Component({
          //templateUrl: './app.component.html'
        })
        export class MyComponent {}
      `;

        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(resolvedTemplateUrls).toHaveLength(0);
      });

      it('should handle templateUrl with backticks', () => {
        const code = `
        @Component({
          templateUrl: \`./app.component.html\`
        })
        export class MyComponent {}
      `;

        const expectedUrl = {
          relativePath: './app.component.html',
          absolutePath: '/path/to/src/app.component.html',
        };
        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(resolvedTemplateUrls).toMatchNormalizedPaths([expectedUrl]);
      });

      it('should ignore templateUrls inside string literals', () => {
        const code = `
        const snippet = "templateUrl: './not-a-real-template.html'";

        @Component({
          templateUrl: './app.component.html'
        })
        export class MyComponent {}
      `;

        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(resolvedTemplateUrls).toMatchNormalizedPaths([
          {
            relativePath: './app.component.html',
            absolutePath: '/path/to/src/app.component.html',
          },
        ]);
      });
    });
  });

  describe('component-resolvers inline template', () => {
    it('extracts inline template strings from component decorators', () => {
      const code = `
        @Component({
          template: \`<section class="hero">Hello</section>\`
        })
        export class MyComponent {}
      `;

      expect(getInlineTemplates(code)).toEqual([
        '<section class="hero">Hello</section>',
      ]);
    });

    it('extracts multiple inline templates across a file', () => {
      const code = `
        @Component({ template: '<div>A</div>' })
        export class A {}

        @Component({ template: \`<div>B</div>\` })
        export class B {}
      `;

      expect(getInlineTemplates(code)).toEqual([
        '<div>A</div>',
        '<div>B</div>',
      ]);
    });

    it('ignores template properties outside @Component decorators', () => {
      const code = `
        const preview = {
          template: '<div>Preview only</div>'
        };

        @Component({
          selector: 'demo-card',
          template: '<section>Inline</section>'
        })
        export class DemoCardComponent {}
      `;

      expect(getInlineTemplates(code)).toEqual(['<section>Inline</section>']);
      expect(getAngularComponentMetadata(code)).toEqual([
        {
          className: 'DemoCardComponent',
          selector: 'demo-card',
          styleUrls: [],
          templateUrls: [],
          inlineTemplates: ['<section>Inline</section>'],
        },
      ]);
    });

    it('extracts component metadata for selector, class name, and templates', () => {
      const code = `
        @Component({
          selector: 'demo-card',
          templateUrl: './demo-card.component.html',
          template: '<section>Inline</section>'
        })
        export class DemoCardComponent {}

        @Component({
          template: \`<div>Selectorless</div>\`
        })
        export class DemoDialogComponent {}
      `;

      expect(getAngularComponentMetadata(code)).toEqual([
        {
          className: 'DemoCardComponent',
          selector: 'demo-card',
          styleUrls: [],
          templateUrls: ['./demo-card.component.html'],
          inlineTemplates: ['<section>Inline</section>'],
        },
        {
          className: 'DemoDialogComponent',
          styleUrls: [],
          templateUrls: [],
          inlineTemplates: ['<div>Selectorless</div>'],
        },
      ]);
    });

    it('extracts component styleUrls alongside other metadata', () => {
      const code = `
        @Component({
          selector: 'demo-card',
          styleUrl: './demo-card.component.css',
          styleUrls: ['./demo-card.theme.css', '../shared/demo-card.tokens.css'],
          template: '<section>Inline</section>'
        })
        export class DemoCardComponent {}
      `;

      expect(getAngularComponentMetadata(code)).toEqual([
        {
          className: 'DemoCardComponent',
          selector: 'demo-card',
          styleUrls: [
            './demo-card.component.css',
            './demo-card.theme.css',
            '../shared/demo-card.tokens.css',
          ],
          templateUrls: [],
          inlineTemplates: ['<section>Inline</section>'],
        },
      ]);
    });
  });
});
