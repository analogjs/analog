import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obug', () => ({
  createDebug: vi.fn(() => vi.fn()),
  enable: vi.fn(),
}));

import { enable } from 'obug';
import { applyDebugOption } from './debug.js';

describe('applyDebugOption (angular)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
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
});
