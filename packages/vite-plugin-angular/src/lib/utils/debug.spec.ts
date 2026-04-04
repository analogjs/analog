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

import { enable } from 'obug';
import {
  applyDebugOption,
  activateDeferredDebug,
  _resetDeferredDebug,
} from './debug.js';

describe('applyDebugOption (angular)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
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
