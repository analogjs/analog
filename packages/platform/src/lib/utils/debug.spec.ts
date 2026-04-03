import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obug', () => ({
  createDebug: vi.fn(() => vi.fn()),
  enable: vi.fn(),
}));

import { enable } from 'obug';
import {
  activateDeferredDebug,
  applyDebugOption,
  _resetDeferredDebug,
} from './debug.js';

describe('applyDebugOption (platform)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
    _resetDeferredDebug();
  });

  it('enables all analog:* scopes when debug is true', () => {
    applyDebugOption(true);
    expect(enable).toHaveBeenCalledWith('analog:*');
  });

  it('enables listed namespaces when debug is a non-empty array', () => {
    applyDebugOption(['analog:platform', 'analog:angular:hmr']);
    expect(enable).toHaveBeenCalledWith('analog:platform,analog:angular:hmr');
  });

  it('enables a single namespace when debug has one entry', () => {
    applyDebugOption(['analog:platform:routes']);
    expect(enable).toHaveBeenCalledWith('analog:platform:routes');
  });

  it('does not call enable when debug is an empty array', () => {
    applyDebugOption([]);
    expect(enable).not.toHaveBeenCalled();
  });

  it('does not call enable when debug is undefined', () => {
    applyDebugOption(undefined);
    expect(enable).not.toHaveBeenCalled();
  });

  it('does not call enable when debug is false', () => {
    applyDebugOption(false as unknown as undefined);
    expect(enable).not.toHaveBeenCalled();
  });

  it('enables immediately when object has no mode', () => {
    applyDebugOption({ scopes: true });
    expect(enable).toHaveBeenCalledWith('analog:*');
  });

  it('enables immediately with scopes array and no mode', () => {
    applyDebugOption({ scopes: ['analog:platform'] });
    expect(enable).toHaveBeenCalledWith('analog:platform');
  });

  it('defers when mode is specified', () => {
    applyDebugOption({ mode: 'build' });
    expect(enable).not.toHaveBeenCalled();
  });

  it('defers with scopes and mode', () => {
    applyDebugOption({ scopes: ['analog:platform'], mode: 'dev' });
    expect(enable).not.toHaveBeenCalled();
  });
});

describe('activateDeferredDebug (platform)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
    _resetDeferredDebug();
  });

  it('activates when command matches mode (build)', () => {
    applyDebugOption({ mode: 'build' });
    activateDeferredDebug('build');
    expect(enable).toHaveBeenCalledWith('analog:*');
  });

  it('activates when command matches mode (serve → dev)', () => {
    applyDebugOption({ mode: 'dev' });
    activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledWith('analog:*');
  });

  it('does not activate when command does not match mode', () => {
    applyDebugOption({ mode: 'build' });
    activateDeferredDebug('serve');
    expect(enable).not.toHaveBeenCalled();
  });

  it('is idempotent — second call is a no-op', () => {
    applyDebugOption({ mode: 'build' });
    activateDeferredDebug('build');
    vi.mocked(enable).mockClear();
    activateDeferredDebug('build');
    expect(enable).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing is deferred', () => {
    activateDeferredDebug('build');
    expect(enable).not.toHaveBeenCalled();
  });

  it('uses custom scopes with deferred mode', () => {
    applyDebugOption({ scopes: ['analog:platform:routes'], mode: 'dev' });
    activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledWith('analog:platform:routes');
  });
});
