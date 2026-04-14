import { describe, expect, it, vi } from 'vitest';

import type * as ts from 'typescript';
import { augmentHostWithResources } from './host.js';
import { AnalogStylesheetRegistry } from './stylesheet-registry.js';
import { TailwindReferenceError } from './utils/tailwind-reference.js';

describe('augmentHostWithResources', () => {
  it('preprocesses external stylesheets before Vite transforms them', async () => {
    const host = { readFile: vi.fn() } as unknown as ts.CompilerHost;
    const transform = vi.fn().mockResolvedValue({ code: '.demo{color:red}' });
    const stylePreprocessor = vi.fn(
      (code: string, filename: string) => `/* ${filename} */\n${code}`,
    );

    augmentHostWithResources(host, transform as any, {
      inlineStylesExtension: 'css',
      stylePreprocessor,
    });

    const result = await (host as any).transformResource(
      '.demo { color: red; }',
      {
        type: 'style',
        resourceFile: '/project/src/app/demo.component.css',
        containingFile: '/project/src/app/demo.component.ts',
      },
    );

    expect(stylePreprocessor).toHaveBeenCalledWith(
      '.demo { color: red; }',
      '/project/src/app/demo.component.css',
      {
        filename: '/project/src/app/demo.component.css',
        containingFile: '/project/src/app/demo.component.ts',
        resourceFile: '/project/src/app/demo.component.css',
        className: undefined,
        order: undefined,
        inline: false,
      },
    );
    expect(transform).toHaveBeenCalledWith(
      '/* /project/src/app/demo.component.css */\n.demo { color: red; }',
      '/project/src/app/demo.component.css?direct',
    );
    expect(result).toEqual({ content: '.demo{color:red}' });
  });

  it('falls back to the containing file for inline style filenames', async () => {
    const host = { readFile: vi.fn() } as unknown as ts.CompilerHost;
    const transform = vi
      .fn()
      .mockResolvedValue({ code: '.demo{display:grid}' });
    const stylePreprocessor = vi.fn(
      (code: string, filename: string) => `/* ${filename} */\n${code}`,
    );

    augmentHostWithResources(host, transform as any, {
      inlineStylesExtension: 'css',
      stylePreprocessor,
    });

    await (host as any).transformResource('.demo { display: grid; }', {
      type: 'style',
      containingFile: '/project/src/app/demo.component.ts',
    });

    expect(stylePreprocessor).toHaveBeenCalledWith(
      '.demo { display: grid; }',
      '/project/src/app/demo.component.css',
      {
        filename: '/project/src/app/demo.component.css',
        containingFile: '/project/src/app/demo.component.ts',
        resourceFile: undefined,
        className: undefined,
        order: undefined,
        inline: true,
      },
    );
    expect(transform).toHaveBeenCalledWith(
      '/* /project/src/app/demo.component.css */\n.demo { display: grid; }',
      '/project/src/app/demo.component.css?direct',
    );
  });

  it('preprocesses inline styles stored in the stylesheet registry', async () => {
    const host = { readFile: vi.fn() } as unknown as ts.CompilerHost;
    const transform = vi.fn();
    const stylesheetRegistry = new AnalogStylesheetRegistry();
    const stylePreprocessor = vi.fn(
      (code: string, filename: string) => `/* ${filename} */\n${code}`,
    );

    augmentHostWithResources(host, transform as any, {
      inlineStylesExtension: 'css',
      stylesheetRegistry,
      stylePreprocessor,
    });

    const result = await (host as any).transformResource(
      '.demo { color: red; }',
      {
        type: 'style',
        containingFile: '/project/src/app/demo.component.ts',
        className: 'DemoComponent',
        order: 0,
      },
    );

    expect(stylePreprocessor).toHaveBeenCalledWith(
      '.demo { color: red; }',
      '/project/src/app/demo.component.css',
      {
        filename: '/project/src/app/demo.component.css',
        containingFile: '/project/src/app/demo.component.ts',
        resourceFile: undefined,
        className: 'DemoComponent',
        order: 0,
        inline: true,
      },
    );
    expect(transform).not.toHaveBeenCalled();
    expect(stylesheetRegistry.getServedContent(result.content)).toBe(
      '/* /project/src/app/demo.component.css */\n.demo { color: red; }',
    );
  });

  it('stores stylesheet dependencies and diagnostics from structured results', async () => {
    const host = { readFile: vi.fn() } as unknown as ts.CompilerHost;
    const transform = vi.fn();
    const stylesheetRegistry = new AnalogStylesheetRegistry();
    const stylePreprocessor = vi.fn(() => ({
      code: '.demo { color: red; }',
      dependencies: [{ id: 'virtual:brandos/tailwind.css', kind: 'bridge' }],
      diagnostics: [
        {
          severity: 'warning',
          code: 'selector-contract-drift',
          message: 'Theme selector drift detected.',
        },
      ],
      tags: ['tailwind'],
    }));

    augmentHostWithResources(host, transform as any, {
      inlineStylesExtension: 'css',
      stylesheetRegistry,
      stylePreprocessor,
    });

    await (host as any).transformResource('.demo { color: red; }', {
      type: 'style',
      containingFile: '/project/src/app/demo.component.ts',
      className: 'DemoComponent',
      order: 0,
      resourceFile: '/project/src/app/demo.component.css',
    });

    expect(
      stylesheetRegistry.getDependenciesForSource(
        '/project/src/app/demo.component.css',
      ),
    ).toEqual([{ id: 'virtual:brandos/tailwind.css', kind: 'bridge' }]);
    expect(
      stylesheetRegistry.getDiagnosticsForSource(
        '/project/src/app/demo.component.css',
      ),
    ).toEqual([
      {
        severity: 'warning',
        code: 'selector-contract-drift',
        message: 'Theme selector drift detected.',
      },
    ]);
    expect(
      stylesheetRegistry.getTagsForSource(
        '/project/src/app/demo.component.css',
      ),
    ).toEqual(['tailwind']);
  });

  it('returns null when eager stylesheet transform fails', async () => {
    const host = { readFile: vi.fn() } as unknown as ts.CompilerHost;
    const transform = vi.fn().mockRejectedValue(new Error('boom'));

    augmentHostWithResources(host, transform as any, {
      inlineStylesExtension: 'css',
    });

    await expect(
      (host as any).transformResource('.demo { color: red; }', {
        type: 'style',
        resourceFile: '/project/src/app/demo.component.css',
        containingFile: '/project/src/app/demo.component.ts',
      }),
    ).resolves.toBeNull();
  });

  it('rethrows TailwindReferenceError from eager stylesheet transforms', async () => {
    const host = { readFile: vi.fn() } as unknown as ts.CompilerHost;
    const transform = vi
      .fn()
      .mockRejectedValue(
        new TailwindReferenceError('comment-masked @reference'),
      );

    augmentHostWithResources(host, transform as any, {
      inlineStylesExtension: 'css',
    });

    await expect(
      (host as any).transformResource('.demo { color: red; }', {
        type: 'style',
        resourceFile: '/project/src/app/demo.component.css',
        containingFile: '/project/src/app/demo.component.ts',
      }),
    ).rejects.toThrow('comment-masked @reference');
  });
});
