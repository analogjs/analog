import { describe, expect, it } from 'vitest';
import { parsePluginOptions } from './plugin-options-schema.js';

describe('Analog option boundary', () => {
  it('preserves explicit false and normalizes undefined to omitted defaults', () => {
    expect(
      parsePluginOptions({
        jit: false,
        fastCompile: false,
        liveReload: false,
        include: undefined,
        debug: { mode: undefined, logFile: false },
      }),
    ).toEqual({
      jit: false,
      fastCompile: false,
      liveReload: false,
      debug: { logFile: false },
    });
  });
  it('retains lazy tsconfig getters and both environment replacements', () => {
    let calls = 0;
    const tsconfig = () => {
      calls++;
      return 'tsconfig.json';
    };
    const options = {
      tsconfig,
      fileReplacements: [
        { replace: 'source.ts', with: 'browser.ts', ssr: 'server.ts' },
      ],
    };
    expect(parsePluginOptions(options)).toEqual(options);
    expect(calls).toBe(0);
  });
  it.each([
    { liveReload: 'false' },
    { fastCompileMode: 'fast' },
    { fileReplacements: [{ replace: 'source.ts' }] },
    { experimental: { useAngularCompilationAPI: 1 } },
    { liveReLoad: true },
  ])('rejects malformed owned configuration: %j', (value) => {
    expect(() => parsePluginOptions(value)).toThrow();
  });
});
