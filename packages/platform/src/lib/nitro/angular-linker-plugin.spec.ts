import { describe, expect, it } from 'vitest';

import { angularLinkerPlugin } from './angular-linker-plugin';

describe('angularLinkerPlugin', () => {
  const plugin = angularLinkerPlugin();

  it('exposes a Rolldown plugin shape', () => {
    expect(plugin.name).toBe('analogjs-platform-angular-linker');
    expect(typeof plugin.transform).toBe('function');
  });

  it('skips non-JS files', async () => {
    const result = await plugin.transform('export const x = 1;', '/foo.ts');
    expect(result).toBeUndefined();
  });

  it('skips JS files that do not contain partial Angular declarations', async () => {
    const result = await plugin.transform(
      'export const greeting = "hello";',
      '/foo.mjs',
    );
    expect(result).toBeUndefined();
  });

  it('links partial Angular declarations with the Babel bundled by compiler-cli', async () => {
    const partial = [
      "import * as i0 from '@angular/core';",
      'export class Svc {}',
      'Svc.\u0275fac = i0.\u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "22.0.0", ngImport: i0, type: Svc, deps: [], target: i0.\u0275\u0275FactoryTarget.Injectable });',
      'Svc.\u0275prov = i0.\u0275\u0275ngDeclareInjectable({ minVersion: "12.0.0", version: "22.0.0", ngImport: i0, type: Svc });',
    ].join('\n');

    const result = (await plugin.transform(partial, '/svc.mjs')) as {
      code: string;
      map: unknown;
    };

    expect(result.code).toContain('\u0275\u0275defineInjectable');
    expect(result.code).not.toContain('ngDeclare');
    expect(result.map).toBeTruthy();
  });
});
