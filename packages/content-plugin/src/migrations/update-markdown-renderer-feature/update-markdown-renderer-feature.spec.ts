import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { addDependenciesToPackageJson, Tree } from '@nx/devkit';
import { nxVersion } from '@nx/vite';

import update from './update-markdown-renderer-feature';
import appGenerator from '../../../../nx-plugin/src/generators/app/generator';

describe('update-markdown-renderer-feature migration', () => {
  let tree: Tree;

  beforeEach(() => {});

  async function setup() {
    tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });

    addDependenciesToPackageJson(tree, {}, { nx: nxVersion });

    await appGenerator(tree, {
      analogAppName: 'my-app',
      addTRPC: false,
      addTailwind: false,
      skipFormat: true,
    });

    tree.write(
      'apps/my-app/src/app/app.config.ts',
      `import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
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
};`
    );
  }

  it('should add withPrismHighlighter', async () => {
    await setup();
    await update(tree);
    const configContent = tree.read(
      'apps/my-app/src/app/app.config.ts',
      'utf-8'
    );
    expect(configContent).toContain('withPrismHighlighter()');
    expect(configContent).toContain('@analogjs/content/prism-highlighter');
  });
});
