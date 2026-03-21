import { describe, it, expect } from 'vitest';
import { contentDevToolsPlugin } from './content-devtools-plugin';

describe('contentDevToolsPlugin', () => {
  it('returns a Vite plugin with the correct name', () => {
    const plugin = contentDevToolsPlugin();
    expect(plugin.name).toBe('analog-content-devtools');
  });

  it('applies only to serve mode', () => {
    const plugin = contentDevToolsPlugin();
    expect(plugin.apply).toBe('serve');
  });

  it('has a transformIndexHtml hook', () => {
    const plugin = contentDevToolsPlugin();
    expect(plugin.transformIndexHtml).toBeDefined();
  });

  it('has a configResolved hook', () => {
    const plugin = contentDevToolsPlugin();
    expect(plugin.configResolved).toBeDefined();
  });
});
