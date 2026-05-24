import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analogNitroPlugin } from './analog-nitro-plugin';

function callConfig(plugin: any, root: string) {
  const hook = plugin.config;
  return typeof hook === 'function'
    ? hook({ root }, { command: 'build', mode: 'production' })
    : hook?.handler({ root }, { command: 'build', mode: 'production' });
}

function callResolveId(plugin: any, id: string) {
  const hook = plugin.resolveId;
  if (typeof hook === 'function') {
    return hook.call({} as any, id, undefined, {} as any);
  }
  return hook?.handler.call({} as any, id, undefined, {} as any);
}

function callLoad(plugin: any, id: string) {
  const hook = plugin.load;
  if (typeof hook === 'function') {
    return hook.call({} as any, id);
  }
  return hook?.handler.call({} as any, id);
}

describe('analogNitroPlugin', () => {
  let workspaceRoot: string;
  let projectRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-nitro-plugin-'));
    projectRoot = workspaceRoot;
    mkdirSync(join(workspaceRoot, 'src'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'src/main.server.ts'),
      'export default () => "<!doctype html><html></html>";',
    );
    writeFileSync(
      join(workspaceRoot, 'index.html'),
      '<!doctype html><html><body><div id="app"></div></body></html>',
    );
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('exposes the expected plugin shape', () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    expect(plugin.name).toBe('@analogjs/nitro');
    expect(plugin.enforce).toBe('pre');
    expect(typeof plugin.config).toBe('function');
    expect(typeof plugin.resolveId).toBe('function');
    expect(typeof plugin.load).toBe('function');
    expect(typeof (plugin as any).nitro.setup).toBe('function');
  });

  it('registers the SSR service entry and linker optimizeDeps when ssr=true', () => {
    const plugin = analogNitroPlugin({ workspaceRoot, ssr: true });
    const overrides: any = callConfig(plugin, projectRoot);

    expect(overrides.experimental.vite.services.ssr.entry).toMatch(
      /\.analog\/__ssr-entry\.mjs$/,
    );
    expect(overrides.environments.ssr.optimizeDeps.include).toContain(
      '@angular/core',
    );
    expect(overrides.environments.ssr.optimizeDeps.include).toContain(
      '@angular/platform-server',
    );
    expect(
      overrides.environments.ssr.optimizeDeps.rolldownOptions.plugins,
    ).toHaveLength(1);
  });

  it('does not configure SSR overrides when ssr=false', () => {
    const plugin = analogNitroPlugin({ workspaceRoot, ssr: false });
    const overrides: any = callConfig(plugin, projectRoot);

    expect(overrides.experimental).toBeUndefined();
    expect(overrides.environments).toBeUndefined();
  });

  it('resolves the SSR entry marker path to the virtual id', () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot);

    const markerPath = join(workspaceRoot, '.analog/__ssr-entry.mjs');
    expect(callResolveId(plugin, markerPath)).toBe(
      '\0virtual:@analogjs/nitro/ssr-entry',
    );
    expect(callResolveId(plugin, '/some/other/path.ts')).toBeNull();
  });

  it('emits a wrapper that imports the user main.server.ts and inlines the template', () => {
    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot);

    const code = callLoad(plugin, '\0virtual:@analogjs/nitro/ssr-entry');
    expect(typeof code).toBe('string');
    expect(code).toContain('main.server.ts');
    expect(code).toContain('export default {');
    expect(code).toContain('fetch(req)');
    // Template is JSON.stringified into the wrapper, so quotes are escaped.
    expect(code).toContain('id=\\"app\\"');
    expect(code).toContain("'x-analog-no-ssr'");
  });

  it('registers page handlers and the page-endpoints rollup plugin in nitro setup', async () => {
    mkdirSync(join(workspaceRoot, 'src/app/pages'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'src/app/pages/index.server.ts'),
      'export const load = () => ({});',
    );

    const plugin = analogNitroPlugin({ workspaceRoot });
    callConfig(plugin, projectRoot);

    const hookFn = vi.fn();
    const nitroMock: any = {
      options: {
        rootDir: projectRoot,
        buildDir: join(projectRoot, '.nitro'),
        handlers: [],
        scanDirs: [],
        virtual: {},
        renderer: {},
        dev: true,
      },
      hooks: { hook: hookFn },
    };

    await (plugin as any).nitro.setup(nitroMock);

    expect(nitroMock.options.handlers).toHaveLength(1);
    expect(nitroMock.options.handlers[0].route).toContain('/_analog/pages');
    expect(hookFn).toHaveBeenCalledWith('rollup:before', expect.any(Function));
  });
});
