import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveOutDir } from './vite-build.impl';

describe('resolveOutDir', () => {
  const workspaceRoot = resolve('/workspace');

  it('resolves a workspace-relative outputPath against the workspace root', () => {
    expect(resolveOutDir(workspaceRoot, 'dist/apps/my-app/client')).toBe(
      resolve(workspaceRoot, 'dist/apps/my-app/client'),
    );
  });

  it('keeps an absolute outputPath', () => {
    const outputPath = resolve('/tmp/out/client');
    expect(resolveOutDir(workspaceRoot, outputPath)).toBe(outputPath);
  });

  it('returns undefined without an outputPath so vite.config build.outDir applies', () => {
    expect(resolveOutDir(workspaceRoot, undefined)).toBeUndefined();
  });
});
