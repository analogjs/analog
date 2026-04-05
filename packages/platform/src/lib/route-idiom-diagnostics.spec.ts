import { describe, expect, it } from 'vitest';

import {
  analyzeAnalogRouteFile,
  formatAnalogRouteIdiomDiagnostic,
} from './route-idiom-diagnostics.js';

describe('route-idiom-diagnostics', () => {
  it('reports OXC parse errors with codeframes', () => {
    const diagnostics = analyzeAnalogRouteFile({
      filename: '/workspace/src/app/pages/broken.page.ts',
      code: 'const =',
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'oxc-parse',
      severity: 'error',
    });
    expect(diagnostics[0].details).toContain('Unexpected token');
  });

  it('warns when a page route has no default export', () => {
    const diagnostics = analyzeAnalogRouteFile({
      filename: '/workspace/src/app/pages/about.page.ts',
      code: "export const title = 'About';",
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'missing-default-export',
    );
  });

  it('does not warn about missing default exports for redirect-only routes', () => {
    const diagnostics = analyzeAnalogRouteFile({
      filename: '/workspace/src/app/pages/index.page.ts',
      code: [
        'export const routeMeta = {',
        "  redirectTo: '/home',",
        "  pathMatch: 'full',",
        '};',
      ].join('\n'),
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'missing-default-export',
    );
  });

  it('warns when redirect routes also default-export a component', () => {
    const diagnostics = analyzeAnalogRouteFile({
      filename: '/workspace/src/app/pages/index.page.ts',
      code: [
        'export const routeMeta = {',
        "  redirectTo: '/home',",
        "  pathMatch: 'full',",
        '};',
        '',
        'export default class HomeRedirectPage {}',
      ].join('\n'),
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'redirect-with-component',
    );
  });

  it('warns on relative redirect targets', () => {
    const diagnostics = analyzeAnalogRouteFile({
      filename: '/workspace/src/app/pages/cities/index.page.ts',
      code: [
        'export const routeMeta = {',
        "  redirectTo: 'new-york',",
        "  pathMatch: 'full',",
        '};',
      ].join('\n'),
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'relative-redirect',
    );
  });

  it('warns on the legacy routeJsonLd export', () => {
    const diagnostics = analyzeAnalogRouteFile({
      filename: '/workspace/src/app/pages/article.page.ts',
      code: [
        'export const routeJsonLd = {',
        "  '@context': 'https://schema.org',",
        "  '@type': 'Article',",
        '};',
        '',
        'export default class ArticlePage {}',
      ].join('\n'),
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'legacy-route-jsonld-export',
    );
  });

  it('warns when a layout-looking route does not reference RouterOutlet', () => {
    const diagnostics = analyzeAnalogRouteFile({
      filename: '/workspace/src/app/pages/products.page.ts',
      code: 'export default class ProductsPage {}',
      routeFiles: [
        '/workspace/src/app/pages/products.page.ts',
        '/workspace/src/app/pages/products/[id].page.ts',
      ],
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'layout-without-router-outlet',
    );
  });

  it('does not warn when a layout-looking route references RouterOutlet', () => {
    const diagnostics = analyzeAnalogRouteFile({
      filename: '/workspace/src/app/pages/products.page.ts',
      code: [
        "import { Component } from '@angular/core';",
        "import { RouterOutlet } from '@angular/router';",
        '',
        '@Component({',
        '  imports: [RouterOutlet],',
        "  template: '<router-outlet />',",
        '})',
        'export default class ProductsPage {}',
      ].join('\n'),
      routeFiles: [
        '/workspace/src/app/pages/products.page.ts',
        '/workspace/src/app/pages/products/[id].page.ts',
      ],
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'layout-without-router-outlet',
    );
  });

  it('formats diagnostics with workspace-relative file paths', () => {
    const message = formatAnalogRouteIdiomDiagnostic(
      {
        code: 'missing-default-export',
        severity: 'warning',
        message: 'Missing default export.',
      },
      '/workspace/src/app/pages/about.page.ts',
      '/workspace',
    );

    expect(message).toContain('/src/app/pages/about.page.ts');
    expect(message).toContain('WARNING: Missing default export.');
  });
});
