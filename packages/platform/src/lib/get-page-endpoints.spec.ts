import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { normalizePath } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getPageEndpoints } from './get-page-endpoints';
import { getPageHandlers } from './nitro/get-page-handlers';

const files = [
  'index.server.ts',
  'users/[id].server.ts',
  'products/[...slug].server.ts',
  '(auth)/login.server.ts',
];

describe('getPageEndpoints', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-page-endpoints-'));
    for (const file of files) {
      const path = join(workspaceRoot, 'src/app/pages', file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, 'export const load = async () => ({});');
    }
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  const args = () => ({ workspaceRoot, sourceRoot: 'src', rootDir: '.' });

  it('maps page files to prefix-free routes', () => {
    const endpoints = getPageEndpoints(args());

    expect(endpoints.map((e) => e.route).sort()).toEqual([
      '/pages/-auth-/login',
      '/pages/index',
      '/pages/products/**:slug',
      '/pages/users/:id',
    ]);
    expect(
      normalizePath(
        endpoints.find((e) => e.route === '/pages/users/:id')!.file,
      ),
    ).toBe(
      normalizePath(join(workspaceRoot, 'src/app/pages/users/[id].server.ts')),
    );
  });

  it('mounts Nitro handlers under /api/_analog', () => {
    expect(getPageHandlers(args())).toContainEqual(
      expect.objectContaining({
        route: '/api/_analog/pages/users/:id',
        lazy: true,
      }),
    );
  });
});
