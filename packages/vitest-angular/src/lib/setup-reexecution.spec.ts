import { fakeAsync, tick } from '@angular/core/testing';

// Vitest re-executes setup files for every test file in a reused worker
// (e.g. isolate: false). Re-evaluating the setup module must be a no-op.
describe('setup re-execution', () => {
  it('does not throw when the setup module is evaluated again', async () => {
    expect((globalThis as any)['__vitest_zone_patch__']).toBe(true);
    const patchedIt = (globalThis as any)['it'];

    vi.resetModules();
    await expect(import('../../setup-vitest')).resolves.toBeDefined();

    expect((globalThis as any)['it']).toBe(patchedIt);
    expect((globalThis as any)['__vitest_zone_patch__']).toBe(true);
  });

  it('keeps fakeAsync working after re-evaluation', fakeAsync(() => {
    let elapsed = false;
    setTimeout(() => (elapsed = true), 100);
    tick(100);
    expect(elapsed).toBe(true);
  }));
});
