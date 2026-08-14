/**
 * Duplicates of this file (keep in sync):
 *   packages/platform/src/lib/utils/debug-harness.spec.ts
 *   packages/vite-plugin-angular/src/lib/utils/debug-harness.spec.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obug', () => ({
  createDebug: vi.fn((ns: string) => {
    const fn: any = vi.fn();
    fn.log = vi.fn();
    fn.namespace = ns;
    return fn;
  }),
  enable: vi.fn(),
}));

vi.mock('./debug-log-file.js', () => ({
  wrapInstancesForFileLog: vi.fn(),
  wrapInstancesForScopedFileLog: vi.fn(),
  DEBUG_LOG_DIR: 'tmp/debug',
  DEBUG_LOG_FILENAME: 'analog.log',
}));

import { enable } from 'obug';
import {
  wrapInstancesForFileLog,
  wrapInstancesForScopedFileLog,
} from './debug-log-file.js';
import { createDebugHarness } from './debug-harness.js';

function makeHarness(fallback = 'test:*') {
  return createDebugHarness({
    fallbackNamespace: fallback,
    instanceGroups: [[]],
  });
}

describe('applyDebugOption', () => {
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    vi.mocked(enable).mockClear();
    vi.mocked(wrapInstancesForFileLog).mockClear();
    vi.mocked(wrapInstancesForScopedFileLog).mockClear();
    harness = makeHarness();
  });

  it('enables fallback namespace when debug is true', () => {
    harness.applyDebugOption(true);
    expect(enable).toHaveBeenCalledWith('test:*');
  });

  it('enables listed namespaces when debug is a non-empty array', () => {
    harness.applyDebugOption(['test:a', 'test:b']);
    expect(enable).toHaveBeenCalledWith('test:a,test:b');
  });

  it('enables a single namespace when debug has one entry', () => {
    harness.applyDebugOption(['test:a']);
    expect(enable).toHaveBeenCalledWith('test:a');
  });

  it('does not call enable when debug is an empty array', () => {
    harness.applyDebugOption([]);
    expect(enable).not.toHaveBeenCalled();
  });

  it('does not call enable when debug is undefined', () => {
    harness.applyDebugOption(undefined);
    expect(enable).not.toHaveBeenCalled();
  });

  it('does not call enable when debug is false', () => {
    harness.applyDebugOption(false);
    expect(enable).not.toHaveBeenCalled();
  });

  it('enables immediately when object has no mode', () => {
    harness.applyDebugOption({ scopes: true });
    expect(enable).toHaveBeenCalledWith('test:*');
  });

  it('enables immediately with scopes array and no mode', () => {
    harness.applyDebugOption({ scopes: ['test:a'] });
    expect(enable).toHaveBeenCalledWith('test:a');
  });

  it('defers when mode is specified', () => {
    harness.applyDebugOption({ mode: 'build' });
    expect(enable).not.toHaveBeenCalled();
  });

  it('defers with scopes and mode', () => {
    harness.applyDebugOption({ scopes: ['test:a'], mode: 'dev' });
    expect(enable).not.toHaveBeenCalled();
  });
});

describe('activateDeferredDebug', () => {
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    vi.mocked(enable).mockClear();
    harness = makeHarness();
  });

  it('activates when command matches mode (build)', () => {
    harness.applyDebugOption({ mode: 'build' });
    harness.activateDeferredDebug('build');
    expect(enable).toHaveBeenCalledWith('test:*');
  });

  it('activates when command matches mode (serve -> dev)', () => {
    harness.applyDebugOption({ mode: 'dev' });
    harness.activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledWith('test:*');
  });

  it('does not activate when command does not match mode', () => {
    harness.applyDebugOption({ mode: 'build' });
    harness.activateDeferredDebug('serve');
    expect(enable).not.toHaveBeenCalled();
  });

  it('is idempotent — second call is a no-op', () => {
    harness.applyDebugOption({ mode: 'build' });
    harness.activateDeferredDebug('build');
    vi.mocked(enable).mockClear();
    harness.activateDeferredDebug('build');
    expect(enable).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing is deferred', () => {
    harness.activateDeferredDebug('build');
    expect(enable).not.toHaveBeenCalled();
  });

  it('uses custom scopes with deferred mode', () => {
    harness.applyDebugOption({ scopes: ['test:a'], mode: 'dev' });
    harness.activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledWith('test:a');
  });

  it('activates different scopes per command from an array', () => {
    harness.applyDebugOption([
      { scopes: ['test:a'], mode: 'dev' },
      { scopes: ['test:b'], mode: 'build' },
    ]);
    harness.activateDeferredDebug('build');
    expect(enable).toHaveBeenCalledTimes(1);
    expect(enable).toHaveBeenCalledWith('test:b');
  });

  it('activates the dev entry from an array when serving', () => {
    harness.applyDebugOption([
      { scopes: ['test:a'], mode: 'dev' },
      { scopes: ['test:b'], mode: 'build' },
    ]);
    harness.activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledTimes(1);
    expect(enable).toHaveBeenCalledWith('test:a');
  });

  it('enables immediate entries and defers mode entries from an array', () => {
    harness.applyDebugOption([
      { scopes: ['test:a'] },
      { scopes: ['test:b'], mode: 'dev' },
    ]);
    expect(enable).toHaveBeenCalledWith('test:a');
    vi.mocked(enable).mockClear();
    harness.activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledWith('test:b');
  });
});

describe('logFile wiring', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
    vi.mocked(wrapInstancesForFileLog).mockClear();
    vi.mocked(wrapInstancesForScopedFileLog).mockClear();
  });

  it('sets up single-file logging when logFile is true', () => {
    const harness = makeHarness();
    harness.applyDebugOption({ logFile: true });
    expect(wrapInstancesForFileLog).toHaveBeenCalled();
    expect(wrapInstancesForScopedFileLog).not.toHaveBeenCalled();
  });

  it('sets up single-file logging when logFile is "single"', () => {
    const harness = makeHarness();
    harness.applyDebugOption({ logFile: 'single' });
    expect(wrapInstancesForFileLog).toHaveBeenCalled();
    expect(wrapInstancesForScopedFileLog).not.toHaveBeenCalled();
  });

  it('sets up scoped file logging when logFile is "scoped"', () => {
    const harness = makeHarness();
    harness.applyDebugOption({ logFile: 'scoped' });
    expect(wrapInstancesForScopedFileLog).toHaveBeenCalled();
    expect(wrapInstancesForFileLog).not.toHaveBeenCalled();
  });

  it('does not set up file logging when logFile is absent', () => {
    const harness = makeHarness();
    harness.applyDebugOption({ scopes: true });
    expect(wrapInstancesForFileLog).not.toHaveBeenCalled();
    expect(wrapInstancesForScopedFileLog).not.toHaveBeenCalled();
  });

  it('does not set up file logging for boolean true', () => {
    const harness = makeHarness();
    harness.applyDebugOption(true);
    expect(wrapInstancesForFileLog).not.toHaveBeenCalled();
    expect(wrapInstancesForScopedFileLog).not.toHaveBeenCalled();
  });

  it('does not set up file logging for string array', () => {
    const harness = makeHarness();
    harness.applyDebugOption(['test:a']);
    expect(wrapInstancesForFileLog).not.toHaveBeenCalled();
    expect(wrapInstancesForScopedFileLog).not.toHaveBeenCalled();
  });

  it('extracts logFile from array of DebugModeOptions', () => {
    const harness = makeHarness();
    harness.applyDebugOption([
      { scopes: ['test:a'], logFile: true },
      { scopes: ['test:b'], mode: 'dev' },
    ]);
    expect(wrapInstancesForFileLog).toHaveBeenCalled();
  });

  it('extracts scoped logFile from array of DebugModeOptions', () => {
    const harness = makeHarness();
    harness.applyDebugOption([
      { scopes: ['test:a'], logFile: 'scoped' },
      { scopes: ['test:b'], mode: 'build' },
    ]);
    expect(wrapInstancesForScopedFileLog).toHaveBeenCalled();
    expect(wrapInstancesForFileLog).not.toHaveBeenCalled();
  });

  it('uses provided workspaceRoot for single-file path', () => {
    const harness = makeHarness();
    harness.applyDebugOption({ logFile: true }, '/custom/root');
    const callArgs = vi.mocked(wrapInstancesForFileLog).mock.calls[0];
    expect(callArgs[1]).toContain('/custom/root');
  });

  it('uses provided workspaceRoot for scoped dir path', () => {
    const harness = makeHarness();
    harness.applyDebugOption({ logFile: 'scoped' }, '/custom/root');
    const callArgs = vi.mocked(wrapInstancesForScopedFileLog).mock.calls[0];
    expect(callArgs[1]).toContain('/custom/root');
  });

  it('wraps all instance groups', () => {
    const harness = createDebugHarness({
      fallbackNamespace: 'test:*',
      instanceGroups: [[], []],
    });
    harness.applyDebugOption({ logFile: true });
    expect(wrapInstancesForFileLog).toHaveBeenCalledTimes(2);
  });

  it('wraps all instance groups for scoped mode', () => {
    const harness = createDebugHarness({
      fallbackNamespace: 'test:*',
      instanceGroups: [[], []],
    });
    harness.applyDebugOption({ logFile: 'scoped' });
    expect(wrapInstancesForScopedFileLog).toHaveBeenCalledTimes(2);
  });

  it('does not wrap when deferred mode does not match', () => {
    const harness = makeHarness();
    harness.applyDebugOption({ mode: 'build', logFile: true });
    expect(wrapInstancesForFileLog).not.toHaveBeenCalled();
    expect(wrapInstancesForScopedFileLog).not.toHaveBeenCalled();
    harness.activateDeferredDebug('serve');
    expect(wrapInstancesForFileLog).not.toHaveBeenCalled();
    expect(wrapInstancesForScopedFileLog).not.toHaveBeenCalled();
  });

  it('wraps only when deferred mode matches', () => {
    const harness = makeHarness();
    harness.applyDebugOption({ mode: 'build', logFile: true });
    expect(wrapInstancesForFileLog).not.toHaveBeenCalled();
    harness.activateDeferredDebug('build');
    expect(wrapInstancesForFileLog).toHaveBeenCalled();
  });

  it('wraps scoped when deferred mode matches', () => {
    const harness = makeHarness();
    harness.applyDebugOption({ mode: 'dev', logFile: 'scoped' });
    expect(wrapInstancesForScopedFileLog).not.toHaveBeenCalled();
    harness.activateDeferredDebug('serve');
    expect(wrapInstancesForScopedFileLog).toHaveBeenCalled();
  });
});
