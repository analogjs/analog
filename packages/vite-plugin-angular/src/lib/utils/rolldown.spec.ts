import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockRolldownVersion: string | undefined;

vi.mock('vite', async () => {
  const actual = await vi.importActual<typeof import('vite')>('vite');
  return {
    ...actual,
    get rolldownVersion() {
      return mockRolldownVersion;
    },
  };
});

import { getJsTransformConfigKey, isRolldown } from './rolldown.js';

describe('rolldown utils', () => {
  beforeEach(() => {
    mockRolldownVersion = undefined;
  });

  it('detects when rolldown is enabled', () => {
    mockRolldownVersion = '1.0.0';

    expect(isRolldown()).toBe(true);
    expect(getJsTransformConfigKey()).toBe('oxc');
  });

  it('falls back to esbuild when rolldown is unavailable', () => {
    expect(isRolldown()).toBe(false);
    expect(getJsTransformConfigKey()).toBe('esbuild');
  });
});
