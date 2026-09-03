import { describe, expect, it } from 'vitest';
import { SERVER_MODE_ID, serverModePlugin } from './server-mode-plugin.js';

describe('serverModePlugin', () => {
  const [plugin] = serverModePlugin();
  const resolveId = plugin.resolveId as (id: string) => string | undefined;
  const load = plugin.load as (id: string) => string | undefined;

  it('serves a module that sets ngServerMode before app modules evaluate', () => {
    const resolved = resolveId(SERVER_MODE_ID);

    expect(resolved).toBe(`\0${SERVER_MODE_ID}`);
    expect(load(resolved!)).toContain('globalThis.ngServerMode = true;');
  });

  it('ignores other ids', () => {
    expect(resolveId('/src/main.server.ts')).toBeUndefined();
    expect(load('/src/main.server.ts')).toBeUndefined();
  });
});
