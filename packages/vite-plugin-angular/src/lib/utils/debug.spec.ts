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

describe('applyDebugOption (angular)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
    _resetDeferredDebug();
  });

  it('enables all analog:angular:* scopes when debug is true', () => {
    applyDebugOption(true);
    expect(enable).toHaveBeenCalledWith('analog:angular:*');
  });

  it('enables listed namespaces when debug is a non-empty array', () => {
    applyDebugOption(['analog:angular:hmr', 'analog:angular:styles']);
    expect(enable).toHaveBeenCalledWith(
      'analog:angular:hmr,analog:angular:styles',
    );
  });

  it('enables a single namespace when debug has one entry', () => {
    applyDebugOption(['analog:angular:compiler']);
    expect(enable).toHaveBeenCalledWith('analog:angular:compiler');
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
    expect(enable).toHaveBeenCalledWith('analog:angular:*');
  });

  it('enables immediately with scopes array and no mode', () => {
    applyDebugOption({ scopes: ['analog:angular:hmr'] });
    expect(enable).toHaveBeenCalledWith('analog:angular:hmr');
  });

  it('defers when mode is specified', () => {
    applyDebugOption({ mode: 'build' });
    expect(enable).not.toHaveBeenCalled();
  });

  it('defers with scopes and mode', () => {
    applyDebugOption({ scopes: ['analog:angular:hmr'], mode: 'dev' });
    expect(enable).not.toHaveBeenCalled();
  });
});

describe('activateDeferredDebug (angular)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
    _resetDeferredDebug();
  });

  it('activates when command matches mode (build)', () => {
    applyDebugOption({ mode: 'build' });
    activateDeferredDebug('build');
    expect(enable).toHaveBeenCalledWith('analog:angular:*');
  });

  it('activates when command matches mode (serve → dev)', () => {
    applyDebugOption({ mode: 'dev' });
    activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledWith('analog:angular:*');
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
    applyDebugOption({
      scopes: ['analog:angular:compiler'],
      mode: 'dev',
    });
    activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledWith('analog:angular:compiler');
  });

  it('activates different scopes per command from an array', () => {
    applyDebugOption([
      { scopes: ['analog:angular:hmr'], mode: 'dev' },
      { scopes: ['analog:angular:compiler'], mode: 'build' },
    ]);
    activateDeferredDebug('build');
    expect(enable).toHaveBeenCalledTimes(1);
    expect(enable).toHaveBeenCalledWith('analog:angular:compiler');
  });

  it('activates the dev entry from an array when serving', () => {
    applyDebugOption([
      { scopes: ['analog:angular:hmr'], mode: 'dev' },
      { scopes: ['analog:angular:compiler'], mode: 'build' },
    ]);
    activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledTimes(1);
    expect(enable).toHaveBeenCalledWith('analog:angular:hmr');
  });

  it('enables immediate entries and defers mode entries from an array', () => {
    applyDebugOption([
      { scopes: ['analog:angular:styles'] },
      { scopes: ['analog:angular:hmr'], mode: 'dev' },
    ]);
    expect(enable).toHaveBeenCalledWith('analog:angular:styles');
    vi.mocked(enable).mockClear();
    activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledWith('analog:angular:hmr');
  });
});
