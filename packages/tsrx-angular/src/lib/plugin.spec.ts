import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  createServer,
  normalizePath,
  type Plugin,
  type ViteDevServer,
} from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearTsrxCache, lowerTsrxForScan } from './cache.js';
import { tsrxAngular } from './plugin.js';
import { TsrxTypeGenerator, type TsrxTypesResult } from './types.js';

const EMPTY_TYPES_RESULT: TsrxTypesResult = {
  written: [],
  removed: [],
  diagnostics: [],
};

const SAMPLE_TSRX = `import { signal } from '@angular/core';
export function Counter() @{
  const count = signal(0);
  <button>{count()}</button>
}
`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let root: string;
let server: ViteDevServer | undefined;

function writeFixture(files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(root, name);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
}

function stubFastCompilePlugin(): Plugin {
  return {
    name: 'stub-fast-compile',
    api: {
      fastCompile: {
        registerSourceFormat: vi.fn(),
        scanImports: vi.fn(),
        resolveSelector: vi.fn(),
        compile: vi.fn(),
      },
    },
  };
}

async function createDevServer(
  pluginOptions: Parameters<typeof tsrxAngular>[0] = {},
): Promise<ViteDevServer> {
  server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    plugins: [tsrxAngular(pluginOptions), stubFastCompilePlugin()],
  });
  return server;
}

function invokeHook(hook: unknown, ...args: unknown[]): unknown {
  if (typeof hook === 'function') {
    return hook(...args);
  }
  if (hook && typeof hook === 'object' && 'handler' in hook) {
    return (hook as { handler: (...a: unknown[]) => unknown }).handler(...args);
  }
  return undefined;
}

describe('tsrxAngular plugin lifecycle and cache eviction', () => {
  beforeEach(() => {
    clearTsrxCache();
    root = normalizePath(
      mkdtempSync(join(import.meta.dirname, '.plugin-spec-')),
    );
    writeFixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'es2022',
          module: 'preserve',
          moduleResolution: 'bundler',
          skipLibCheck: true,
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'src/counter.tsrx': SAMPLE_TSRX,
    });
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    clearTsrxCache();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('removes watcher listeners and cancels pending debounce timers on middlewareMode server close', async () => {
    const generate = vi
      .spyOn(TsrxTypeGenerator.prototype, 'generate')
      .mockResolvedValue(EMPTY_TYPES_RESULT);

    const devServer = await createDevServer();
    expect(devServer.httpServer).toBeNull();

    await vi.waitFor(() => {
      expect(generate).toHaveBeenCalledTimes(1);
    });

    const addBefore = devServer.watcher.listenerCount('add');
    const changeBefore = devServer.watcher.listenerCount('change');
    const unlinkBefore = devServer.watcher.listenerCount('unlink');

    // Queue a debounced re-run right before closing the server.
    devServer.watcher.emit('change', join(root, 'src/counter.tsrx'));
    await devServer.close();
    server = undefined;

    expect(devServer.watcher.listenerCount('add')).toBe(addBefore - 1);
    expect(devServer.watcher.listenerCount('change')).toBe(changeBefore - 1);
    expect(devServer.watcher.listenerCount('unlink')).toBe(unlinkBefore - 1);

    // Wait past the 100ms debounce window; no post-close run should occur.
    await sleep(150);
    expect(generate).toHaveBeenCalledTimes(1);

    // Late watcher events after close must also be ignored.
    devServer.watcher.emit('change', join(root, 'src/counter.tsrx'));
    await sleep(150);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('does not schedule a follow-up run when closed while generation is in flight', async () => {
    let resolveGenerate!: (result: TsrxTypesResult) => void;
    const generate = vi
      .spyOn(TsrxTypeGenerator.prototype, 'generate')
      .mockImplementation(
        () =>
          new Promise<TsrxTypesResult>((resolve) => {
            resolveGenerate = resolve;
          }),
      );

    const devServer = await createDevServer();
    await vi.waitFor(() => {
      expect(generate).toHaveBeenCalledTimes(1);
    });

    // Trigger a debounced change while the initial run is still in flight.
    devServer.watcher.emit('change', join(root, 'src/counter.tsrx'));
    await sleep(140);

    await devServer.close();
    server = undefined;

    // Complete the in-flight run after close; the queued re-run must be skipped.
    resolveGenerate(EMPTY_TYPES_RESULT);
    await sleep(50);

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('aborts startup without attaching watcher listeners if closed before typeGenerator resolves', async () => {
    const generate = vi
      .spyOn(TsrxTypeGenerator.prototype, 'generate')
      .mockResolvedValue(EMPTY_TYPES_RESULT);

    const watcher = new EventEmitter();
    const httpServer = new EventEmitter();
    const mockServer = {
      config: {
        root,
        logger: { warn: vi.fn(), error: vi.fn() },
      },
      watcher,
      httpServer,
    } as unknown as ViteDevServer;

    const plugin = tsrxAngular();
    invokeHook(plugin.configureServer, mockServer);
    // Close synchronously before `await typeGenerator(...)` resolves.
    invokeHook(plugin.closeBundle);

    await sleep(50);

    expect(watcher.listenerCount('add')).toBe(0);
    expect(watcher.listenerCount('change')).toBe(0);
    expect(watcher.listenerCount('unlink')).toBe(0);
    expect(httpServer.listenerCount('close')).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  });

  it('cleans up watcher listeners and timers when httpServer emits close', async () => {
    const generate = vi
      .spyOn(TsrxTypeGenerator.prototype, 'generate')
      .mockResolvedValue(EMPTY_TYPES_RESULT);

    const watcher = new EventEmitter();
    const httpServer = new EventEmitter();
    const mockServer = {
      config: {
        root,
        logger: { warn: vi.fn(), error: vi.fn() },
      },
      watcher,
      httpServer,
    } as unknown as ViteDevServer;

    const plugin = tsrxAngular();
    invokeHook(plugin.configureServer, mockServer);

    await vi.waitFor(() => {
      expect(generate).toHaveBeenCalledTimes(1);
    });

    expect(watcher.listenerCount('add')).toBe(1);
    expect(watcher.listenerCount('change')).toBe(1);
    expect(watcher.listenerCount('unlink')).toBe(1);
    expect(httpServer.listenerCount('close')).toBe(1);

    watcher.emit('change', join(root, 'src/counter.tsrx'));
    httpServer.emit('close');

    expect(watcher.listenerCount('add')).toBe(0);
    expect(watcher.listenerCount('change')).toBe(0);
    expect(watcher.listenerCount('unlink')).toBe(0);
    expect(httpServer.listenerCount('close')).toBe(0);

    await sleep(150);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('evicts deleted .tsrx files on watchChange and clears cache on server close', async () => {
    const devServer = await createDevServer({ types: false });
    const plugin = devServer.config.plugins.find(
      (p) => p.name === '@analogjs/tsrx-angular',
    )!;

    const fileA = normalizePath(join(root, 'src/a.tsrx'));
    const fileB = normalizePath(join(root, 'src/b.tsrx'));

    const firstA = await lowerTsrxForScan(SAMPLE_TSRX, fileA);
    const firstB = await lowerTsrxForScan(SAMPLE_TSRX, fileB);
    expect(await lowerTsrxForScan(SAMPLE_TSRX, fileA)).toBe(firstA);

    // Non-delete events and non-.tsrx deletions leave cached entries intact.
    invokeHook(plugin.watchChange, fileA, { event: 'update' });
    invokeHook(plugin.watchChange, normalizePath(join(root, 'src/a.ts')), {
      event: 'delete',
    });
    expect(await lowerTsrxForScan(SAMPLE_TSRX, fileA)).toBe(firstA);

    // Deleting a .tsrx file evicts only that file.
    invokeHook(plugin.watchChange, fileA, { event: 'delete' });
    expect(await lowerTsrxForScan(SAMPLE_TSRX, fileA)).not.toBe(firstA);
    expect(await lowerTsrxForScan(SAMPLE_TSRX, fileB)).toBe(firstB);

    // Closing the dev server clears remaining cached entries.
    await devServer.close();
    server = undefined;
    expect(await lowerTsrxForScan(SAMPLE_TSRX, fileB)).not.toBe(firstB);
  });
});
