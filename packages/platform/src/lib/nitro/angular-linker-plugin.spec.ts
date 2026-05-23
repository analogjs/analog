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
});
