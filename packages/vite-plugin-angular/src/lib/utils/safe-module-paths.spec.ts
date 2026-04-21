import { describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from 'vite';

vi.mock('vite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vite')>();
  return {
    ...actual,
    // Use the real normalizePath but override so we can also test the
    // Windows branch (the real function only calls slash() on Windows).
    normalizePath: actual.normalizePath,
  };
});

import { markStylePathSafe } from './safe-module-paths.js';

function fakeConfig(): ResolvedConfig & { safeModulePaths: Set<string> } {
  return { safeModulePaths: new Set() } as any;
}

describe('markStylePathSafe', () => {
  it('adds the clean path and the ?inline path', () => {
    const config = fakeConfig();
    markStylePathSafe(config, '/workspace/libs/ui/button.component.scss');

    expect(
      config.safeModulePaths.has('/workspace/libs/ui/button.component.scss'),
    ).toBe(true);
    expect(
      config.safeModulePaths.has(
        '/workspace/libs/ui/button.component.scss?inline',
      ),
    ).toBe(true);
  });

  it('normalizes paths via Vite normalizePath', () => {
    const config = fakeConfig();
    // normalizePath resolves /../ segments
    markStylePathSafe(config, '/workspace/libs/ui/../ui/button.component.scss');

    expect(
      config.safeModulePaths.has('/workspace/libs/ui/button.component.scss'),
    ).toBe(true);
    expect(
      config.safeModulePaths.has(
        '/workspace/libs/ui/button.component.scss?inline',
      ),
    ).toBe(true);
  });

  it('normalizes Windows backslashes to forward slashes', async () => {
    // Vite's normalizePath only converts backslashes on Windows.
    // Mock it to simulate Windows behavior on any platform.
    const vite = await import('vite');
    const original = vite.normalizePath;
    vi.spyOn(vite, 'normalizePath').mockImplementation((p: string) =>
      original(p.replace(/\\/g, '/')),
    );

    try {
      const config = fakeConfig();
      markStylePathSafe(
        config,
        'C:\\workspace\\libs\\ui\\button.component.scss',
      );

      expect(
        config.safeModulePaths.has(
          'C:/workspace/libs/ui/button.component.scss',
        ),
      ).toBe(true);
      expect(
        config.safeModulePaths.has(
          'C:/workspace/libs/ui/button.component.scss?inline',
        ),
      ).toBe(true);
    } finally {
      vi.mocked(vite.normalizePath).mockRestore();
    }
  });

  it('is a no-op when safeModulePaths is absent', () => {
    const config = {} as ResolvedConfig;
    // Should not throw
    markStylePathSafe(config, '/workspace/libs/ui/button.component.scss');
  });
});
