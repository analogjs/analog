import { describe, expect, it, vi } from 'vitest';

import type * as ts from 'typescript';
import { augmentHostWithResources } from './host.js';

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
    );
    expect(transform).toHaveBeenCalledWith(
      '/* /project/src/app/demo.component.css */\n.demo { display: grid; }',
      '/project/src/app/demo.component.css?direct',
    );
  });
});
