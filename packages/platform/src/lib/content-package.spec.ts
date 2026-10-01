import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { contentPlugin } from './content-plugin.js';
import { routerPlugin } from './router-plugin.js';

describe('compiled content package discovery', () => {
  const workspaceRoot = resolve(import.meta.dirname, '../../../..');
  const root = resolve(workspaceRoot, 'apps/docs-analog');
  const code = readFileSync(
    resolve(
      workspaceRoot,
      'node_modules/@analogjs/content/fesm2022/analogjs-content.mjs',
    ),
    'utf8',
  );

  it('populates the content list after library bundling', () => {
    const plugin = contentPlugin().find(
      (plugin) => plugin.name === 'analog-content-glob-routes',
    )!;
    (plugin.config as any)({ root });

    const result = (plugin.transform as any)(code);

    expect(result?.code).toContain('introduction.md?analog-content-list=true');
    expect(result?.code).not.toContain('let ANALOG_CONTENT_FILE_LIST = {};');
    expect(result?.code).toContain('return ANALOG_CONTENT_FILE_LIST;');
  });

  it('populates the content loaders after library bundling', () => {
    const plugin = routerPlugin().find(
      (plugin) => plugin.name === 'analog-glob-routes',
    )!;
    (plugin.config as any)({ root });

    const result = (plugin.transform as any)(code);

    expect(result?.code).toContain('introduction.md?analog-content-file=true');
    expect(result?.code).not.toContain('let ANALOG_CONTENT_ROUTE_FILES = {};');
    expect(result?.code).toContain('return ANALOG_CONTENT_ROUTE_FILES;');
  });
});
