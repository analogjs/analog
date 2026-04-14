import { describe, expect, it, vi } from 'vitest';
import {
  AnalogStylesheetRegistry,
  preprocessStylesheet,
  preprocessStylesheetResult,
  registerStylesheetContent,
  rewriteRelativeCssImports,
} from './stylesheet-registry.js';

describe('stylesheet-registry', () => {
  it('applies the style preprocessor when provided', () => {
    const stylePreprocessor = vi.fn((code: string, filename: string) => {
      return `/* ${filename} */\n${code}`;
    });

    expect(
      preprocessStylesheet(
        '.demo { color: red; }',
        '/project/src/app/demo.component.css',
        stylePreprocessor,
        {
          filename: '/project/src/app/demo.component.css',
          inline: false,
        },
      ),
    ).toBe('/* /project/src/app/demo.component.css */\n.demo { color: red; }');
  });

  it('rewrites relative css imports to absolute paths', () => {
    expect(
      rewriteRelativeCssImports(
        '@import "./submenu/submenu.component.css";\n.demo { color: red; }',
        '/project/src/app/header.component.css',
      ),
    ).toBe(
      '@import "/project/src/app/submenu/submenu.component.css";\n.demo { color: red; }',
    );
  });

  it('rewrites relative css imports in url(...) form to absolute paths', () => {
    expect(
      rewriteRelativeCssImports(
        '@import url("./submenu/submenu.component.css");\n.demo { color: red; }',
        '/project/src/app/header.component.css',
      ),
    ).toBe(
      '@import url("/project/src/app/submenu/submenu.component.css");\n.demo { color: red; }',
    );
  });

  it('registers stylesheet content under the generated id and resource aliases', () => {
    const registry = new AnalogStylesheetRegistry();

    const stylesheetId = registerStylesheetContent(registry, {
      code: '.demo { color: red; }',
      containingFile: '/project/src/app/demo.component.ts',
      className: 'DemoComponent',
      order: 0,
      inlineStylesExtension: 'css',
      resourceFile: '/project/src/app/demo.component.css',
    });

    expect(stylesheetId).toMatch(/^[a-f0-9]+\.css$/);
    expect(registry.getServedContent(stylesheetId)).toBe(
      '.demo { color: red; }',
    );
    expect(
      registry.getServedContent('/project/src/app/demo.component.css'),
    ).toBe('.demo { color: red; }');
    expect(
      registry.getServedContent('project/src/app/demo.component.css'),
    ).toBe('.demo { color: red; }');
    expect(registry.getServedContent('demo.component.css')).toBeUndefined();
  });

  it('keeps structured transform metadata on the source stylesheet', () => {
    const registry = new AnalogStylesheetRegistry();

    const stylesheetId = registerStylesheetContent(registry, {
      code: '.demo { color: red; }',
      dependencies: [
        { id: 'virtual:brandos/tailwind.css', kind: 'bridge' },
        { id: '/tokens/brand.json', kind: 'token' },
      ],
      diagnostics: [
        {
          severity: 'warning',
          code: 'selector-contract-drift',
          message: 'PrimeNG dark selector does not match the shared contract.',
        },
      ],
      tags: ['tailwind', 'primeng'],
      containingFile: '/project/src/app/demo.component.ts',
      className: 'DemoComponent',
      order: 0,
      inlineStylesExtension: 'css',
      resourceFile: '/project/src/app/demo.component.css',
    });

    expect(stylesheetId).toMatch(/^[a-f0-9]+\.css$/);
    expect(
      registry.getDependenciesForSource('/project/src/app/demo.component.css'),
    ).toEqual([
      { id: 'virtual:brandos/tailwind.css', kind: 'bridge' },
      { id: '/tokens/brand.json', kind: 'token' },
    ]);
    expect(
      registry.getDiagnosticsForSource('/project/src/app/demo.component.css'),
    ).toEqual([
      {
        severity: 'warning',
        code: 'selector-contract-drift',
        message: 'PrimeNG dark selector does not match the shared contract.',
      },
    ]);
    expect(
      registry.getTagsForSource('/project/src/app/demo.component.css'),
    ).toEqual(['tailwind', 'primeng']);
  });

  it('tracks active request ids for a source stylesheet', () => {
    const registry = new AnalogStylesheetRegistry();

    registry.registerExternalRequest(
      'abc123.css',
      '/project/src/app/demo.component.css',
    );
    registry.registerServedStylesheet({
      publicId: 'abc123.css',
      sourcePath: '/project/src/app/demo.component.css',
      normalizedCode: '.demo { color: red; }',
    });
    registry.registerActiveRequest('abc123.css?ngcomp=ng-c1&e=0');

    expect(
      registry.getPublicIdsForSource('/project/src/app/demo.component.css'),
    ).toEqual(['abc123.css']);
    expect(
      registry.getRequestIdsForSource('/project/src/app/demo.component.css'),
    ).toEqual(['abc123.css?ngcomp=ng-c1&e=0']);
  });

  it('tracks active request ids when the served request path starts with a slash', () => {
    const registry = new AnalogStylesheetRegistry();

    registry.registerExternalRequest(
      'abc123.css',
      '/project/src/app/demo.component.css',
    );
    registry.registerServedStylesheet({
      publicId: 'abc123.css',
      sourcePath: '/project/src/app/demo.component.css',
      normalizedCode: '.demo { color: red; }',
    });
    registry.registerActiveRequest('/abc123.css?ngcomp=ng-c1&e=0');

    expect(
      registry.getRequestIdsForSource('/project/src/app/demo.component.css'),
    ).toEqual(['abc123.css?ngcomp=ng-c1&e=0']);
  });

  it('canonicalizes timestamped request ids for active wrapper modules', () => {
    const registry = new AnalogStylesheetRegistry();

    registry.registerExternalRequest(
      'abc123.css',
      '/project/src/app/demo.component.css',
    );
    registry.registerServedStylesheet({
      publicId: 'abc123.css',
      sourcePath: '/project/src/app/demo.component.css',
      normalizedCode: '.demo { color: red; }',
    });

    registry.registerActiveRequest('/abc123.css?ngcomp=ng-c1&e=0&t=123');
    registry.registerActiveRequest('abc123.css?ngcomp=ng-c1&e=0&t=456');

    expect(
      registry.getRequestIdsForSource('/project/src/app/demo.component.css'),
    ).toEqual(['abc123.css?ngcomp=ng-c1&e=0']);
  });

  it('serves the same stylesheet content for timestamped direct and wrapper requests', () => {
    const registry = new AnalogStylesheetRegistry();

    registry.registerExternalRequest(
      'abc123.css',
      '/project/src/app/demo.component.css',
    );
    registry.registerServedStylesheet({
      publicId: 'abc123.css',
      sourcePath: '/project/src/app/demo.component.css',
      normalizedCode: '.demo { color: red; }',
    });

    expect(
      registry.getServedContent('/abc123.css?ngcomp=ng-c1&e=0&t=123'),
    ).toBe('.demo { color: red; }');
    expect(
      registry.getServedContent('/abc123.css?direct&ngcomp=ng-c1&e=0&t=123'),
    ).toBe('.demo { color: red; }');
  });

  it('preserves bare direct query flags and eagerly tracks the paired wrapper request', () => {
    const registry = new AnalogStylesheetRegistry();

    registry.registerExternalRequest(
      'abc123.css',
      '/project/src/app/demo.component.css',
    );
    registry.registerServedStylesheet({
      publicId: 'abc123.css',
      sourcePath: '/project/src/app/demo.component.css',
      normalizedCode: '.demo { color: red; }',
    });

    registry.registerActiveRequest('/abc123.css?direct&ngcomp=ng-c1&e=0&t=123');

    expect(
      registry.getRequestIdsForSource('/project/src/app/demo.component.css'),
    ).toEqual([
      'abc123.css?direct&ngcomp=ng-c1&e=0',
      'abc123.css?ngcomp=ng-c1&e=0',
    ]);
  });

  it('returns structured transform results from preprocessors', () => {
    const result = preprocessStylesheetResult(
      '.demo { color: red; }',
      '/project/src/app/demo.component.css',
      () => ({
        code: '.demo { color: blue; }',
        dependencies: ['virtual:brandos/tailwind.css'],
        diagnostics: [
          {
            severity: 'warning',
            code: 'tailwind-reference',
            message: 'Injected @reference for shared Tailwind bridge.',
          },
        ],
        tags: ['tailwind'],
      }),
      {
        filename: '/project/src/app/demo.component.css',
        inline: false,
      },
    );

    expect(result).toEqual({
      code: '.demo { color: blue; }',
      dependencies: [{ id: 'virtual:brandos/tailwind.css' }],
      diagnostics: [
        {
          severity: 'warning',
          code: 'tailwind-reference',
          message: 'Injected @reference for shared Tailwind bridge.',
        },
      ],
      tags: ['tailwind'],
    });
  });
});
