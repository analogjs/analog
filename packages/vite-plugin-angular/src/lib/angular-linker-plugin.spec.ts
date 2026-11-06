import { afterAll, describe, expect, it } from 'vitest';

import { angularLinkerPlugin } from './angular-linker-plugin';

type Transform = (
  code: string,
  id: string,
) => Promise<{ code: string; map: string | null } | undefined>;

describe('angularLinkerPlugin', () => {
  const plugin = angularLinkerPlugin();
  const transform = plugin.transform as Transform;

  afterAll(() => (plugin.buildEnd as () => Promise<void>)());

  it('skips non-JS files', async () => {
    expect(await transform('export const x = 1;', '/foo.ts')).toBeUndefined();
  });

  it('skips JS files that do not contain partial Angular declarations', async () => {
    expect(
      await transform('export const greeting = "hello";', '/foo.mjs'),
    ).toBeUndefined();
  });

  it('links partial Angular declarations', async () => {
    const partial = [
      "import * as i0 from '@angular/core';",
      'export class Svc {}',
      'Svc.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "22.0.0", ngImport: i0, type: Svc, deps: [], target: i0.ɵɵFactoryTarget.Injectable });',
      'Svc.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "22.0.0", ngImport: i0, type: Svc });',
    ].join('\n');

    const result = await transform(partial, '/svc.mjs');

    expect(result?.code).toContain('ɵɵdefineInjectable');
    expect(result?.code).not.toContain('ngDeclare');
    expect(result?.map).toBeTruthy();
  });
});
