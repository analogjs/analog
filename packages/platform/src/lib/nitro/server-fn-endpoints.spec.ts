import { mkdtempSync } from 'node:fs';
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
});
