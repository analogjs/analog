import { describe, it, expect } from 'vitest';

import {
  downlevelPlugin,
  esbuildDownlevelPlugin,
} from './esbuild-downlevel-plugin';

describe('downlevelPlugin', () => {
  const plugin = downlevelPlugin();

  it('downlevels async arrow functions to es2016', () => {
    const code = `
      const fn = async (x) => {
        await fetch(x);
      };
    `;
    const result = plugin.transform(code, 'test.js');

    expect(result).toBeDefined();
    expect(result!.code).not.toContain('async (');
    expect(result!.map).toBeDefined();
  });

  it('preserves non-async code', () => {
    const code = `const x = 1 + 2;`;
    const result = plugin.transform(code, 'test.js');

    expect(result).toBeUndefined();
  });

  it('handles TestBed async pattern', () => {
    const code = `
      beforeEach(async () => {
        await TestBed.configureTestingModule({
          imports: [AppComponent],
        }).compileComponents();
      });
    `;
    const result = plugin.transform(code, 'app.component.spec.js');

    expect(result).toBeDefined();
    expect(result!.code).not.toContain('async (');
    expect(result!.code).toContain('compileComponents');
  });

  it('returns a sourcemap when transforming', () => {
    const code = `const fn = async (x) => x;`;
    const result = plugin.transform(code, 'test.js');

    expect(result).toBeDefined();
    expect(result!.map).toBeDefined();
    expect(result!.map!.mappings).toBeTruthy();
  });

  it('exports deprecated esbuildDownlevelPlugin alias', () => {
    expect(esbuildDownlevelPlugin).toBe(downlevelPlugin);
  });
});
