import { describe, expect, it } from 'vitest';
import {
  injectDeferStreamingHook,
  inspectAngularCoreModule,
  streamingSupportedOnAngular,
  MIN_STREAMING_ANGULAR_MAJOR,
} from './defer-streaming-plugin.js';

describe('streamingSupportedOnAngular', () => {
  it('supports the floor version and above', () => {
    expect(streamingSupportedOnAngular(MIN_STREAMING_ANGULAR_MAJOR)).toBe(true);
    expect(streamingSupportedOnAngular(MIN_STREAMING_ANGULAR_MAJOR + 1)).toBe(
      true,
    );
  });

  it('rejects versions below the floor (v20 inlines the profiler anchor)', () => {
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
