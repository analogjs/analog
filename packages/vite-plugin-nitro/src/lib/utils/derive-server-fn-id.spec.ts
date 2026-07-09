import { describe, expect, it } from 'vitest';

import { deriveServerFnId, serverFnFileId } from './derive-server-fn-id';

describe('deriveServerFnId', () => {
  const fileId = 'src/app/server-fns/products.server.ts';

  it('is a stable 16-hex-char digest', () => {
    const id = deriveServerFnId(fileId, 'getProducts');
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(deriveServerFnId(fileId, 'getProducts')).toBe(id);
  });

  it('is opaque — not the export name', () => {
    expect(deriveServerFnId(fileId, 'deleteAccount')).not.toContain(
      'deleteAccount',
    );
  });

  it('is collision-free across export names and files', () => {
    expect(deriveServerFnId(fileId, 'a')).not.toBe(
      deriveServerFnId(fileId, 'b'),
    );
    expect(deriveServerFnId('src/x.server.ts', 'a')).not.toBe(
      deriveServerFnId('src/y.server.ts', 'a'),
    );
  });
});

describe('serverFnFileId', () => {
  it('returns the project-root-relative POSIX path', () => {
    expect(
      serverFnFileId('/ws/apps/app/src/app/x.server.ts', '/ws/apps/app'),
    ).toBe('src/app/x.server.ts');
  });

  it('is independent of absolute checkout location for the same relative path', () => {
    const a = serverFnFileId('/a/proj/src/x.server.ts', '/a/proj');
    const b = serverFnFileId('/b/other/proj/src/x.server.ts', '/b/other/proj');
    expect(a).toBe(b);
    expect(deriveServerFnId(a, 'fn')).toBe(deriveServerFnId(b, 'fn'));
  });
});
