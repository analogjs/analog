import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getPageHandlers } from './get-page-handlers';

describe('getPageHandlers', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-page-handlers-'));
    mkdirSync(join(workspaceRoot, 'src/app/pages/users'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'src/app/pages/users/[id].server.ts'),
      'export const load = async () => ({});',
    );
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('registers page endpoints under the default /api prefix', () => {
    const [handler] = getPageHandlers({
      workspaceRoot,
      sourceRoot: 'src',
      rootDir: '.',
    });

    expect(handler.route).toBe('/api/_analog/pages/users/:id');
  });

  it('registers page endpoints under a custom API prefix', () => {
    const [handler] = getPageHandlers({
      workspaceRoot,
      sourceRoot: 'src',
      rootDir: '.',
      apiPrefix: '/services',
    });

    expect(handler.route).toBe('/services/_analog/pages/users/:id');
  });
});
