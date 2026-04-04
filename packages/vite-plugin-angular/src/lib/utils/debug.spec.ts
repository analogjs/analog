import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obug', () => ({
  createDebug: vi.fn(() => {
    const fn: any = vi.fn();
    fn.log = vi.fn();
    fn.namespace = 'test';
    return fn;
  }),
  enable: vi.fn(),
}));

vi.mock('./debug-log-file.js', () => ({
  wrapInstancesForFileLog: vi.fn(),
  wrapInstancesForScopedFileLog: vi.fn(),
  DEBUG_LOG_DIR: 'tmp/debug',
  DEBUG_LOG_FILENAME: 'debug.analog.log',
}));

import { enable } from 'obug';
import { wrapInstancesForFileLog } from './debug-log-file.js';
import {
  applyDebugOption,
  activateDeferredDebug,
  _resetDeferredDebug,
} from './debug.js';

describe('applyDebugOption (angular)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
    vi.mocked(wrapInstancesForFileLog).mockClear();
    _resetDeferredDebug();
  });

  it('enables analog:angular:* when debug is true', () => {
    applyDebugOption(true);
    expect(enable).toHaveBeenCalledWith('analog:angular:*');
  });

  it('does not call enable when debug is false', () => {
    applyDebugOption(false);
    expect(enable).not.toHaveBeenCalled();
  });

  it('enables listed namespaces from array', () => {
    applyDebugOption(['analog:angular:hmr', 'analog:angular:styles']);
    expect(enable).toHaveBeenCalledWith(
      'analog:angular:hmr,analog:angular:styles',
    );
  });
});

describe('activateDeferredDebug (angular)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
    vi.mocked(wrapInstancesForFileLog).mockClear();
    _resetDeferredDebug();
  });

  it('activates deferred build scopes', () => {
    applyDebugOption({ mode: 'build' });
    activateDeferredDebug('build');
    expect(enable).toHaveBeenCalledWith('analog:angular:*');
  });

  it('activates deferred dev scopes on serve', () => {
    applyDebugOption({ mode: 'dev' });
    activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledWith('analog:angular:*');
  });
});

describe('applyDebugOption logFile (angular)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
    vi.mocked(wrapInstancesForFileLog).mockClear();
    _resetDeferredDebug();
  });

  it('sets up file logging when logFile is true in object form', () => {
    applyDebugOption({ logFile: true });
    expect(wrapInstancesForFileLog).toHaveBeenCalled();
    expect(enable).toHaveBeenCalledWith('analog:angular:*');
  });

  it('sets up file logging with specific scopes', () => {
    applyDebugOption({ scopes: ['analog:angular:hmr'], logFile: true });
    expect(wrapInstancesForFileLog).toHaveBeenCalled();
    expect(enable).toHaveBeenCalledWith('analog:angular:hmr');
  });

  it('does not set up file logging when logFile is absent', () => {
    applyDebugOption({ scopes: true });
    expect(wrapInstancesForFileLog).not.toHaveBeenCalled();
  });

  it('does not set up file logging for boolean true', () => {
    applyDebugOption(true);
    expect(wrapInstancesForFileLog).not.toHaveBeenCalled();
  });

  it('does not set up file logging for string array', () => {
    applyDebugOption(['analog:angular:hmr']);
    expect(wrapInstancesForFileLog).not.toHaveBeenCalled();
  });

  it('extracts logFile from array of DebugModeOptions', () => {
    applyDebugOption([
      { scopes: ['analog:angular:hmr'], logFile: true },
      { scopes: ['analog:angular:compiler'], mode: 'build' },
    ]);
    expect(wrapInstancesForFileLog).toHaveBeenCalled();
  });

  it('uses provided workspaceRoot for file path', () => {
    applyDebugOption({ logFile: true }, '/custom/root');
    const callArgs = vi.mocked(wrapInstancesForFileLog).mock.calls[0];
    expect(callArgs[1]).toContain('/custom/root');
  });

  it('wraps only angular instances (single call)', () => {
    applyDebugOption({ logFile: true });
    expect(wrapInstancesForFileLog).toHaveBeenCalledTimes(1);
  });
});
