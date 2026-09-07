import '@angular/compiler';
import { setupTestBed } from '../../../../vitest-angular/setup-testbed';

const { initTestEnvironment, setupHook, cleanupHook } = vi.hoisted(() => ({
  initTestEnvironment: vi.fn(),
  setupHook: vi.fn(),
  cleanupHook: vi.fn(),
}));

vi.mock('@angular/core/testing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core/testing')>()),
  getTestBed: () => ({ initTestEnvironment }),
}));
vi.mock('vitest', () => ({
  beforeEach: setupHook,
  afterEach: cleanupHook,
}));

describe('setupTestBed teardown', () => {
  const key = Symbol.for('testbed-setup');
  let original: unknown;

  beforeEach(() => {
    original = (globalThis as any)[key];
    delete (globalThis as any)[key];
    vi.clearAllMocks();
  });
  afterEach(() => {
    if (original === undefined) delete (globalThis as any)[key];
    else (globalThis as any)[key] = original;
  });

  it('preserves default destruction and cleanup hooks', () => {
    setupTestBed();
    expect(initTestEnvironment.mock.calls[0][2].teardown).toEqual({
      destroyAfterEach: true,
    });
    expect(setupHook).toHaveBeenCalledWith(expect.any(Function));
    expect(cleanupHook).toHaveBeenCalledWith(expect.any(Function));
  });

  it('honors explicit teardown and error options for browser tests', () => {
    setupTestBed({
      teardown: { destroyAfterEach: false },
      errorOnUnknownElements: true,
      errorOnUnknownProperties: true,
    });
    expect(initTestEnvironment.mock.calls[0][2]).toEqual({
      teardown: { destroyAfterEach: false },
      errorOnUnknownElements: true,
      errorOnUnknownProperties: true,
    });
  });
});
