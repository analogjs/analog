import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildServerFnDispatchModule } from './server-fn-endpoints';

/** Re-reads `NODE_PATH`, which Node only parses at startup. */
function initPaths(): void {
  (Module as unknown as { _initPaths(): void })._initPaths();
}

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

  it('skips a zone.js that only NODE_PATH can reach', () => {
    // pnpm's bin shims put the hoisted store on NODE_PATH. `require.resolve`
    // searches it, the bundler does not.
    const hoisted = mkdtempSync(join(tmpdir(), 'analog-hoisted-'));
    mkdirSync(join(hoisted, 'zone.js'));
    writeFileSync(
      join(hoisted, 'zone.js', 'package.json'),
      JSON.stringify({ name: 'zone.js', exports: { './node': './node.js' } }),
    );
    writeFileSync(join(hoisted, 'zone.js', 'node.js'), '');
    const nodePath = process.env['NODE_PATH'];
    process.env['NODE_PATH'] = hoisted;
    initPaths();
    try {
      const src = buildServerFnDispatchModule({
        modules,
        root: mkdtempSync(join(tmpdir(), 'analog-zoneless-')),
      });
      expect(src).not.toContain('zone.js');
    } finally {
      if (nodePath === undefined) {
        delete process.env['NODE_PATH'];
      } else {
        process.env['NODE_PATH'] = nodePath;
      }
      initPaths();
    }
  });
});
