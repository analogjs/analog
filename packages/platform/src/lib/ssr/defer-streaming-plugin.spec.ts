import { describe, expect, it } from 'vitest';
import { injectDeferStreamingHook } from './defer-streaming-plugin.js';

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
