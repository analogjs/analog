import { describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from 'vite';
import {
  deferStreamingPlugin,
  injectDeferStreamingHook,
  inspectAngularCoreModule,
  streamingSupportedOnAngular,
  MIN_STREAMING_ANGULAR_MAJOR,
} from './defer-streaming-plugin.js';

describe('deferStreamingPlugin environment compatibility', () => {
  const bundle = [
    'function applyDeferBlockState(newState, lDetails, lContainer, tNode, hostLView) {',
    '  profiler(ProfilerEvent.DeferBlockStateEnd);',
    '}',
    'function collectNativeNodesInLContainer(lContainer, result) {}',
  ].join('\n');

  function setup(ssr: boolean, environment?: { name: string }) {
    const plugin = deferStreamingPlugin();
    const context = { warn: vi.fn(), environment };
    const configResolved = plugin.configResolved;
    if (typeof configResolved === 'function') {
      configResolved({ build: { ssr } } as ResolvedConfig);
    }
    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : plugin.transform!.handler;
    const buildEnd =
      typeof plugin.buildEnd === 'function'
        ? plugin.buildEnd
        : plugin.buildEnd!.handler;
    return {
      warn: context.warn,
      transform: (code: string) =>
        transform.call(context as never, code, '/@angular/core/core.mjs', {
          ssr,
        }),
      buildEnd: () => buildEnd.call(context as never),
    };
  }

  it.each([undefined, { name: 'ssr' }])(
    'patches SSR with environment %j',
    async (environment) => {
      const plugin = setup(true, environment);
      expect(await plugin.transform(bundle)).toEqual({
        code: expect.stringContaining('__analogSsrDeferCapture'),
      });
      await plugin.buildEnd();
      expect(plugin.warn).not.toHaveBeenCalled();
    },
  );

  it('warns once for drift on Vite 5', async () => {
    const plugin = setup(true);
    const drifted = bundle.replace(
      'profiler(ProfilerEvent.DeferBlockStateEnd);',
      '',
    );
    await plugin.transform(drifted);
    await plugin.transform(drifted);
    await plugin.buildEnd();
    expect(plugin.warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('could not apply the resolution hook'),
    );
  });

  it('warns for missing SSR coverage on Vite 5', async () => {
    const plugin = setup(true);
    await plugin.buildEnd();
    expect(plugin.warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('was never encountered'),
    );
  });

  it('leaves the Vite 5 client build unchanged and quiet', async () => {
    const plugin = setup(false);
    expect(await plugin.transform(bundle)).toBeUndefined();
    await plugin.buildEnd();
    expect(plugin.warn).not.toHaveBeenCalled();
  });
});

describe('streamingSupportedOnAngular', () => {
  it('supports the floor version and above', () => {
    expect(streamingSupportedOnAngular(MIN_STREAMING_ANGULAR_MAJOR)).toBe(true);
    expect(streamingSupportedOnAngular(MIN_STREAMING_ANGULAR_MAJOR + 1)).toBe(
      true,
    );
  });

  it('rejects versions below the qualified floor', () => {
    expect(streamingSupportedOnAngular(MIN_STREAMING_ANGULAR_MAJOR - 1)).toBe(
      false,
    );
    expect(streamingSupportedOnAngular(19)).toBe(false);
  });

  it('does not block when the version is undetectable', () => {
    expect(streamingSupportedOnAngular(null)).toBe(true);
  });
});

describe('injectDeferStreamingHook', () => {
  // A minimal stand-in for the two anchors the real @angular/core defer module
  // carries: the applyDeferBlockState function and its DeferBlockStateEnd
  // profiler call, plus the collectNativeNodesInLContainer function.
  const bundle = [
    'function applyDeferBlockState(newState, lDetails, lContainer, tNode, hostLView) {',
    '  renderDeferBlockState(newState, tNode, lContainer);',
    '  profiler(ProfilerEvent.DeferBlockStateEnd);',
    '}',
    'function collectNativeNodesInLContainer(lContainer, result) {}',
  ].join('\n');

  it('injects the resolution hook before the DeferBlockStateEnd anchor', () => {
    const out = injectDeferStreamingHook(bundle);
    expect(out).not.toBeNull();
    expect(out).toContain('globalThis.__analogSsrDeferCapture');
    // capture must precede the anchor it is threaded in front of
    const capture = out!.indexOf('globalThis.__analogSsrDeferCapture({');
    const anchor = out!.indexOf('profiler(ProfilerEvent.DeferBlockStateEnd);');
    expect(capture).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(anchor);
  });

  it('gates the capture on server mode and Complete state', () => {
    const out = injectDeferStreamingHook(bundle)!;
    expect(out).toContain('newState === DeferBlockState.Complete');
    expect(out).toContain('ngServerMode');
  });

  it('wraps the whole guard in try/catch so drifted internals no-op', () => {
    const out = injectDeferStreamingHook(bundle)!;
    expect(out).toMatch(
      /try\s*\{\s*if \(newState === DeferBlockState\.Complete/,
    );
  });

  it('exposes collectNativeNodesInLContainer on __analogSsrInternals', () => {
    const out = injectDeferStreamingHook(bundle)!;
    expect(out).toContain(
      'globalThis.__analogSsrInternals = Object.assign(globalThis.__analogSsrInternals || {}, { collectNativeNodesInLContainer })',
    );
  });

  it('is a no-op for unrelated modules', () => {
    expect(injectDeferStreamingHook('export const x = 1;')).toBeNull();
    expect(
      injectDeferStreamingHook('function applyDeferBlockState() {}'),
    ).toBeNull();
  });

  it('preserves the original bundle content', () => {
    const out = injectDeferStreamingHook(bundle)!;
    expect(out).toContain('function applyDeferBlockState(');
    expect(out).toContain('profiler(ProfilerEvent.DeferBlockStateEnd);');
    expect(out.length).toBeGreaterThan(bundle.length);
  });

  it('captures the named function with numeric profiler events and a Unicode prefix', () => {
    const numeric =
      '/* 测试 🙂 */ function unrelated() { profiler(ProfilerEvent.DeferBlockStateEnd); }\n' +
      bundle.replace(
        'profiler(ProfilerEvent.DeferBlockStateEnd);',
        'profiler(913);',
      );
    const out = injectDeferStreamingHook(numeric);
    expect(out).not.toBeNull();
    const capture = vi.fn();
    const apply = new Function(
      'globalThis',
      'ngServerMode',
      'DeferBlockState',
      'SSR_UNIQUE_ID',
      'renderDeferBlockState',
      'profiler',
      `${out}; return applyDeferBlockState;`,
    )(
      { __analogSsrDeferCapture: capture },
      true,
      { Complete: 2 },
      0,
      () => undefined,
      () => undefined,
    );
    const container = [];
    apply(2, ['block'], container, {}, {});
    expect(capture).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ ssrUniqueId: 'block', lContainer: container }),
    );
    apply(1, ['loading'], [], {}, {});
    expect(capture).toHaveBeenCalledOnce();
  });

  it('does not install the hook twice in repeated transformations', () => {
    const once = injectDeferStreamingHook(bundle)!;
    expect(injectDeferStreamingHook(once)).toBe(once);
  });
});

describe('inspectAngularCoreModule', () => {
  const bundle = [
    'function applyDeferBlockState(newState, lDetails, lContainer, tNode, hostLView) {',
    '  profiler(ProfilerEvent.DeferBlockStateEnd);',
    '}',
    'function collectNativeNodesInLContainer(lContainer, result) {}',
  ].join('\n');

  it('reports patchable when all anchors are present', () => {
    expect(inspectAngularCoreModule(bundle)).toEqual({ kind: 'patchable' });
  });

  it('reports not-target for unrelated core modules', () => {
    expect(inspectAngularCoreModule('export const x = 1;')).toEqual({
      kind: 'not-target',
    });
  });

  it('reports drift when the defer module lost the profiler anchor', () => {
    const drifted = bundle.replace(
      'profiler(ProfilerEvent.DeferBlockStateEnd);',
      'profiler(ProfilerEvent.DeferBlockRenamed);',
    );
    const info = inspectAngularCoreModule(drifted);
    expect(info.kind).toBe('drifted');
    expect(info.kind === 'drifted' && info.reason).toContain(
      'DeferBlockStateEnd',
    );
  });

  it('reports drift when the subtree collector is gone', () => {
    const drifted = bundle.replace(
      'function collectNativeNodesInLContainer(lContainer, result) {}',
      '',
    );
    const info = inspectAngularCoreModule(drifted);
    expect(info.kind).toBe('drifted');
    expect(info.kind === 'drifted' && info.reason).toContain(
      'collectNativeNodesInLContainer',
    );
  });
});
