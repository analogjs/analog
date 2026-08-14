import { describe, expect, it } from 'vitest';

import nitroDefault, { nitro } from './index.js';

describe('vite-plugin-nitro entrypoint', () => {
  it('exports the nitro plugin as both named and default exports', () => {
    expect(nitroDefault).toBe(nitro);
  });
});
