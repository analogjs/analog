import { describe, it, expect } from 'vitest';

import {
  hasTemplateUrl,
  resolveStyleUrls,
  resolveTemplateUrl,
} from './component-resolvers';

describe('component-resolvers styleUrls', () => {
  const id = '/path/to/src/app.component.ts';

  describe('matcher', () => {
    it('should handle single line styleUrls', () => {
      const code = `
        @Component({
          styleUrls: ['./app.component.css']
        })
        export class MyComponent {}
      `;

      const actualPaths = ['/path/to/src/app.component.css'];
      const resolvedPaths = resolveStyleUrls(code, id);

      expect(resolvedPaths).toStrictEqual(actualPaths);
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

      const actualPaths = [
        '/path/to/src/app.component.css',
        '/path/to/styles.css',
      ];

      const resolvedPaths = resolveStyleUrls(code, id);

      expect(resolvedPaths).toStrictEqual(actualPaths);
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

      const actualPaths = [
        '/path/to/src/app.component.css',
        '/path/to/src/another.css',
        '/path/to/styles.css',
      ];

      const resolvedPaths = resolveStyleUrls(code, id);

      expect(resolvedPaths).toStrictEqual(actualPaths);
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

        const actualUrl = '/path/to/src/app.component.html';
        const resolvedTemplateUrl = resolveTemplateUrl(code, id);

        expect(hasTemplateUrl(code)).toBeTruthy();
        expect(resolvedTemplateUrl).toBe(actualUrl);
      });

      it('should handle templateUrls with double quotes', () => {
        const code = `
        @Component({
          templateUrl: "./app.component.html"
        })
        export class MyComponent {}
      `;

        const actualUrl = '/path/to/src/app.component.html';
        const resolvedTemplateUrl = resolveTemplateUrl(code, id);

        expect(hasTemplateUrl(code)).toBeTruthy();
        expect(resolvedTemplateUrl).toBe(actualUrl);
      });
    });
  });
});
