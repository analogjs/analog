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

vi.mock('@analogjs/vite-plugin-nitro/internal', () => ({
  debugInstances: [],
}));

import { enable } from 'obug';
import {
  applyDebugOption,
  activateDeferredDebug,
  _resetDeferredDebug,
} from './debug.js';

describe('applyDebugOption (platform)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
    _resetDeferredDebug();
  });

  it('enables analog:* when debug is true', () => {
    applyDebugOption(true);
    expect(enable).toHaveBeenCalledWith('analog:*');
  });

  it('does not call enable when debug is false', () => {
    applyDebugOption(false);
    expect(enable).not.toHaveBeenCalled();
  });

  it('enables listed namespaces from array', () => {
    applyDebugOption(['analog:platform', 'analog:angular:hmr']);
    expect(enable).toHaveBeenCalledWith('analog:platform,analog:angular:hmr');
  });
});

describe('activateDeferredDebug (platform)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
    _resetDeferredDebug();
  });

  it('activates deferred build scopes', () => {
    applyDebugOption({ mode: 'build' });
    activateDeferredDebug('build');
    expect(enable).toHaveBeenCalledWith('analog:*');
  });

  it('activates deferred dev scopes on serve', () => {
    applyDebugOption({ mode: 'dev' });
    activateDeferredDebug('serve');
    expect(enable).toHaveBeenCalledWith('analog:*');
  });
});
