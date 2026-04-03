import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obug', () => ({
  createDebug: vi.fn(() => vi.fn()),
  enable: vi.fn(),
}));

import { enable } from 'obug';
import { applyDebugOption } from './debug.js';

describe('applyDebugOption (platform)', () => {
  beforeEach(() => {
    vi.mocked(enable).mockClear();
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
});
