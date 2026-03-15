import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import update from './update-markdown-renderer-feature';

const APP_CONFIG_WITH_MARKDOWN = `import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideClientHydration } from '@angular/platform-browser';
import { provideFileRouter } from '@analogjs/router';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideFileRouter(),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    provideContent(
      withMarkdownRenderer()
    )
  ],
};`;

describe('update-markdown-renderer-feature migration', () => {
  let tree: Tree;

  function setup(content: string, path = 'src/app.config.ts') {
    tree = createTreeWithEmptyWorkspace();
    tree.write(path, content);
  }

  it('should add withPrismHighlighter and import', async () => {
    setup(APP_CONFIG_WITH_MARKDOWN);
    await update(tree);
    const result = tree.read('src/app.config.ts', 'utf-8')!;
    expect(result).toContain('withPrismHighlighter()');
    expect(result).toContain(
      `import { withPrismHighlighter } from '@analogjs/content/prism-highlighter';`,
    );
  });

  it('should not modify files without withMarkdownRenderer', async () => {
    const content = `import { provideContent } from '@analogjs/content';
provideContent();`;
    setup(content);
    await update(tree);
    const result = tree.read('src/app.config.ts', 'utf-8')!;
    expect(result).not.toContain('withPrismHighlighter');
    expect(result).not.toContain('prism-highlighter');
  });

  it('should skip files that already have withPrismHighlighter', async () => {
    const content = APP_CONFIG_WITH_MARKDOWN.replace(
      `import { provideContent, withMarkdownRenderer } from '@analogjs/content';`,
      `import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { withPrismHighlighter } from '@analogjs/content/prism-highlighter';`,
    );
    setup(content);
    await update(tree);
    const result = tree.read('src/app.config.ts', 'utf-8')!;
    // Should not add a duplicate import
    const importCount = (result.match(/withPrismHighlighter/g) || []).length;
    expect(importCount).toBe(1);
  });

  it('should skip files that already have withShikiHighlighter', async () => {
    const content = APP_CONFIG_WITH_MARKDOWN + '\n// withShikiHighlighter';
    setup(content);
    await update(tree);
    const result = tree.read('src/app.config.ts', 'utf-8')!;
    expect(result).not.toContain('withPrismHighlighter');
    expect(result).not.toContain('prism-highlighter');
  });

  it('should not modify non-ts files', async () => {
    const content = `provideContent(withMarkdownRenderer())`;
    setup(content, 'src/config.js');
    await update(tree);
    const result = tree.read('src/config.js', 'utf-8')!;
    expect(result).not.toContain('withPrismHighlighter');
    expect(result).not.toContain('prism-highlighter');
  });

  it('should handle provideContent with multiple existing arguments', async () => {
    const content = `import { provideContent, withMarkdownRenderer } from '@analogjs/content';

provideContent(
  withMarkdownRenderer(),
  someOtherFeature()
);`;
    setup(content);
    await update(tree);
    const result = tree.read('src/app.config.ts', 'utf-8')!;
    expect(result).toContain('withPrismHighlighter()');
    expect(result).toContain(
      `import { withPrismHighlighter } from '@analogjs/content/prism-highlighter';`,
    );
  });

  it('should handle trailing comma in provideContent arguments', async () => {
    const content = `import { provideContent, withMarkdownRenderer } from '@analogjs/content';

provideContent(
  withMarkdownRenderer(),
);`;
    setup(content);
    await update(tree);
    const result = tree.read('src/app.config.ts', 'utf-8')!;
    expect(result).toContain('withPrismHighlighter()');
    expect(result).not.toContain(',,');
  });

  it('should add dependency for angular.json projects', async () => {
    setup(APP_CONFIG_WITH_MARKDOWN);
    tree.write('/angular.json', '{}');
    await update(tree);
    const packageJson = JSON.parse(tree.read('package.json', 'utf-8')!);
    expect(packageJson.dependencies['marked-mangle']).toBe('^1.1.7');
  });
});
