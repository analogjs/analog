import { describe, it, expect } from 'vitest';

import { StyleUrlsResolver, TemplateUrlsResolver } from './component-resolvers';
import { normalizePath } from 'vite';
import { relative } from 'node:path';

const WINDOWS_DRIVE_IN_PATH_RE = /\|[A-Z]:/i;

// array version of normalizePath
const normalizePaths = (paths: string[]) =>
  paths.map((path) =>
    normalizePath(path).replace(WINDOWS_DRIVE_IN_PATH_RE, '|'),
  );

interface CustomMatchers<R = unknown> {
  toMatchNormalizedPaths: (expected: string[]) => R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
  // OS agnostic paths array comparison
  // Two normalized paths are the same if path.relative(p1, p2) === ''
  // In Windows a normalized absolute path includes the drive i.e. C:
  toMatchNormalizedPaths(actual: unknown, expected: string[]) {
    const { matcherHint, printExpected, printReceived, diff } = this.utils;

    if (!(Array.isArray(actual) && actual.length === expected.length)) {
      return {
        pass: false,
        message: () =>
          matcherHint('toMatchNormalizedPaths') +
          '\n\n' +
          'Expected:\n' +
          `  type: ${printExpected('Array')}\n` +
          `  length: ${printExpected(expected.length)}\n` +
          'Received:\n' +
          `  type: ${printReceived(Array.isArray(actual) ? 'Array' : typeof actual)}\n` +
          `  length: ${printReceived(Array.isArray(actual) ? actual.length : '-')}`,
      };
    }

    const normalizedActual = normalizePaths(actual);
    const normalizedExpected = normalizePaths(expected);

    const areSame = normalizedExpected.every(
      (path, index) => relative(normalizedActual[index], path) === '',
    );
    if (!areSame) {
      return {
        pass: false,
        message: () =>
          matcherHint('toMatchNormalizedPaths') +
          '\n\n' +
          '(normalized values)\n' +
          diff(normalizedExpected, normalizedActual),
      };
    }

    return {
      pass: true,
      message: () => 'Paths match',
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
        './app.component.css|/path/to/src/app.component.css',
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
        './app.component.css|/path/to/src/app.component.css',
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
        './app.component.css|/path/to/src/app.component.css',
        '../styles.css|/path/to/styles.css',
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
        './app.component.css|/path/to/src/app.component.css',
        './another.css|/path/to/src/another.css',
        '../styles.css|/path/to/styles.css',
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
        './[param].component.css|/path/to/src/[param].component.css',
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
        './app.component.css|/path/to/src/app.component.css',
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
        './app.component.css|/path/to/src/app.component.css',
        '../styles.css|/path/to/styles.css',
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
        './app.component.css|/path/to/src/app.component.css',
        '../styles.css|/path/to/styles.css',
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
        './app.component.css|/path/to/src/app.component.css',
        './another.css|/path/to/src/another.css',
        '../styles.css|/path/to/styles.css',
      ];

      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(resolvedPaths).toMatchNormalizedPaths(expectedPaths);
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

        const expectedUrl =
          './app.component.html|/path/to/src/app.component.html';
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

        const expectedUrl =
          './[param].component.html|/path/to/src/[param].component.html';
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

        const expectedUrl =
          './app.component.html|/path/to/src/app.component.html';
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

        const expectedUrl =
          './[param].component.html|/path/to/src/[param].component.html';
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

        const expectedUrl1 =
          './app.component.html|/path/to/src/app.component.html';
        const expectedUrl2 =
          './app1.component.html|/path/to/src/app1.component.html';
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

        const expectedUrl =
          './app.component.html|/path/to/src/app.component.html';
        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(resolvedTemplateUrls).toMatchNormalizedPaths([expectedUrl]);
      });
    });
  });
});
