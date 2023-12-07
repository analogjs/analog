import { describe, it, expect } from 'vitest';

import {
  hasTemplateUrl,
  StyleUrlsResolver,
  TemplateUrlsResolver,
} from './component-resolvers';
import { normalizePath } from 'vite';
import { relative } from 'path';

// array version of normalizePath
const normalizePaths = (paths: string[]) =>
  paths.map((path) => normalizePath(path));

// OS agnostic paths array comparison
// Two normalized paths are the same if path.relative(p1, p2) === ''
// In Windows a normalized absolute path includes the drive i.e. C:
const thePathsAreEqual = (actual: string[], expected: string[]) => {
  const arr1 = normalizePaths(actual);
  const arr2 = normalizePaths(expected);

  // check arrays match in length
  if (arr1.length !== arr2.length) {
    return false;
  }

  // check each path of the two arrays are the same
  for (let i = 0; i < arr1.length; i++) {
    if (relative(arr1[i], arr2[i]) !== '') {
      return false;
    }
  }

  return true;
};

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

      const actualPaths = [
        './app.component.css|/path/to/src/app.component.css',
      ];
      const templateUrlsResolver = new TemplateUrlsResolver();
      const resolvedPaths = templateUrlsResolver.resolve(code, id);

      expect(thePathsAreEqual(resolvedPaths, actualPaths));
    });

    it('should handle single line styleUrl', () => {
      const code = `
        @Component({
          styleUrl: './app.component.css'
        })
        export class MyComponent {}
      `;

      const actualPaths = [
        './app.component.css|/path/to/src/app.component.css',
      ];
      const templateUrlsResolver = new TemplateUrlsResolver();
      const resolvedPaths = templateUrlsResolver.resolve(code, id);

      expect(thePathsAreEqual(resolvedPaths, actualPaths));
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
        './app.component.css|/path/to/src/app.component.css',
        '../styles.css|/path/to/styles.css',
      ];

      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(thePathsAreEqual(resolvedPaths, actualPaths));
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
        './app.component.css|/path/to/src/app.component.css',
        './another.css|/path/to/src/another.css',
        '../styles.css|/path/to/styles.css',
      ];

      const styleUrlsResolver = new StyleUrlsResolver();
      const resolvedPaths = styleUrlsResolver.resolve(code, id);

      expect(thePathsAreEqual(resolvedPaths, actualPaths));
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

        const actualUrl =
          './app.component.html|/path/to/src/app.component.html';
        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(hasTemplateUrl(code)).toBeTruthy();
        expect(thePathsAreEqual(resolvedTemplateUrls, [actualUrl]));
      });

      it('should handle templateUrls with double quotes', () => {
        const code = `
        @Component({
          templateUrl: "./app.component.html"
        })
        export class MyComponent {}
      `;

        const actualUrl =
          './app.component.html|/path/to/src/app.component.html';
        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(hasTemplateUrl(code)).toBeTruthy();
        expect(thePathsAreEqual(resolvedTemplateUrls, [actualUrl]));
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

        const actualUrl1 =
          './app.component.html|/path/to/src/app.component.html';
        const actualUrl2 =
          './app1.component.html|/path/to/src/app1.component.html';
        const templateUrlsResolver = new TemplateUrlsResolver();
        const resolvedTemplateUrls = templateUrlsResolver.resolve(code, id);

        expect(hasTemplateUrl(code)).toBeTruthy();
        expect(
          thePathsAreEqual(resolvedTemplateUrls, [actualUrl1, actualUrl2])
        );
      });
    });
  });
});
