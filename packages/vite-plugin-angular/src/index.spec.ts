import { describe, expect, it } from 'vitest';

import angularDefault, { angular } from './index.js';

describe('vite-plugin-angular entrypoint', () => {
  it('exports the angular plugin as both named and default exports', () => {
    expect(angularDefault).toBe(angular);
  });
});
