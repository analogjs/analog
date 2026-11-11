import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildServerFnDispatchModule } from './server-fn-endpoints';

describe('buildServerFnDispatchModule', () => {
  const modules = [{ file: '/ws/app/src/app/products.server.ts' }];

  it('loads zone.js when it resolves from the app root', () => {
    const src = buildServerFnDispatchModule({
      modules,
      root: fileURLToPath(new URL('.', import.meta.url)),
    });
    expect(src).toContain(`import 'zone.js/node';`);
  });

  it('skips zone.js when it does not resolve from the app root', () => {
    const src = buildServerFnDispatchModule({
      modules,
      root: mkdtempSync(join(tmpdir(), 'analog-zoneless-')),
    });
    expect(src).not.toContain('zone.js');
    expect(src).toContain(`import '@angular/platform-server/init';`);
  });

  it('ignores a zone.js only reachable through NODE_PATH', () => {
    const nodePath = mkdtempSync(join(tmpdir(), 'analog-node-path-'));
    mkdirSync(join(nodePath, 'zone.js'));
    writeFileSync(join(nodePath, 'zone.js/package.json'), '{}');
    writeFileSync(join(nodePath, 'zone.js/node.js'), '');
    const initPaths = (Module as unknown as { _initPaths: () => void })
      ._initPaths;
    const previous = process.env['NODE_PATH'];
    process.env['NODE_PATH'] = nodePath;
    initPaths();
    try {
      const src = buildServerFnDispatchModule({
        modules,
        root: mkdtempSync(join(tmpdir(), 'analog-zoneless-')),
      });
      expect(src).not.toContain('zone.js');
    } finally {
      if (previous === undefined) {
        delete process.env['NODE_PATH'];
      } else {
        process.env['NODE_PATH'] = previous;
      }
      initPaths();
    }
  });
});
