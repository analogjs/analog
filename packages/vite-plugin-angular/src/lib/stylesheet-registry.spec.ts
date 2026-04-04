import { describe, expect, it, vi } from 'vitest';
import {
  AnalogStylesheetRegistry,
  preprocessStylesheet,
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
    expect(registry.getServedContent('demo.component.css')).toBe(
      '.demo { color: red; }',
    );
  });
});
