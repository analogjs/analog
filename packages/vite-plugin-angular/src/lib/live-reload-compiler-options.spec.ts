import { describe, expect, it } from 'vitest';
import {
  applyLiveReloadCompilerOptions,
  shouldDiscardIncrementalProgram,
  shouldEnableExternalRuntimeStyles,
} from './live-reload-compiler-options';

const liveReloadWatch = {
  liveReload: true,
  watchMode: true,
};

describe('shouldEnableExternalRuntimeStyles', () => {
  it('stays off for the first watch compilation so first paint is inlined', () => {
    expect(
      shouldEnableExternalRuntimeStyles({
        ...liveReloadWatch,
        initialCompilationDone: false,
      }),
    ).toBe(false);
  });

  it('turns on after the first compilation so later edits can HMR CSS', () => {
    expect(
      shouldEnableExternalRuntimeStyles({
        ...liveReloadWatch,
        initialCompilationDone: true,
      }),
    ).toBe(true);
  });

  it('stays off when liveReload or watch mode is disabled', () => {
    expect(
      shouldEnableExternalRuntimeStyles({
        liveReload: false,
        watchMode: true,
        initialCompilationDone: true,
      }),
    ).toBe(false);
    expect(
      shouldEnableExternalRuntimeStyles({
        liveReload: true,
        watchMode: false,
        initialCompilationDone: true,
      }),
    ).toBe(false);
  });
});

describe('applyLiveReloadCompilerOptions', () => {
  it('does nothing when liveReload is off', () => {
    const options: Record<string, unknown> = {};

    applyLiveReloadCompilerOptions(options, {
      liveReload: false,
      watchMode: true,
      initialCompilationDone: true,
    });

    expect(options).toEqual({});
  });

  it('does nothing for production builds (not watch mode)', () => {
    const options: Record<string, unknown> = {};

    applyLiveReloadCompilerOptions(options, {
      liveReload: true,
      watchMode: false,
      initialCompilationDone: true,
    });

    expect(options).toEqual({});
  });

  it('enables HMR on the first compile without external runtime styles', () => {
    const options: Record<string, unknown> = {};

    applyLiveReloadCompilerOptions(options, {
      ...liveReloadWatch,
      initialCompilationDone: false,
    });

    expect(options['_enableHmr']).toBe(true);
    expect(options['supportTestBed']).toBe(true);
    expect(options['externalRuntimeStyles']).toBeUndefined();
  });

  it('adds external runtime styles only after the first compilation', () => {
    const options: Record<string, unknown> = {};

    applyLiveReloadCompilerOptions(options, {
      ...liveReloadWatch,
      initialCompilationDone: true,
    });

    expect(options['_enableHmr']).toBe(true);
    expect(options['externalRuntimeStyles']).toBe(true);
    expect(options['supportTestBed']).toBe(true);
  });

  it('does not clear unrelated compiler options', () => {
    const options: Record<string, unknown> = { target: 9, strict: true };

    applyLiveReloadCompilerOptions(options, {
      ...liveReloadWatch,
      initialCompilationDone: false,
    });

    expect(options['target']).toBe(9);
    expect(options['strict']).toBe(true);
  });
});

describe('shouldDiscardIncrementalProgram', () => {
  it('stays false for the inlined first compile', () => {
    expect(
      shouldDiscardIncrementalProgram({
        externalRuntimeStylesNowEnabled: false,
        incrementalProgramUsesExternalRuntimeStyles: false,
      }),
    ).toBe(false);
  });

  it('is true for the first compile that turns external styles on', () => {
    // Reusing the inlined NgtscProgram here keeps
    // `externalRuntimeStyles: false` on the compiler while the host remaps
    // styleUrls to hash filenames. Angular then preloads those hashes and
    // throws `Unable to locate component resource: <hash>.scss`.
    expect(
      shouldDiscardIncrementalProgram({
        externalRuntimeStylesNowEnabled: true,
        incrementalProgramUsesExternalRuntimeStyles: false,
      }),
    ).toBe(true);
  });

  it('stays false once the program was built with external styles', () => {
    expect(
      shouldDiscardIncrementalProgram({
        externalRuntimeStylesNowEnabled: true,
        incrementalProgramUsesExternalRuntimeStyles: true,
      }),
    ).toBe(false);
  });

  it('follows the two-phase liveReload sequence', () => {
    const first = {
      ...liveReloadWatch,
      initialCompilationDone: false,
    };
    expect(shouldEnableExternalRuntimeStyles(first)).toBe(false);
    expect(
      shouldDiscardIncrementalProgram({
        externalRuntimeStylesNowEnabled: false,
        incrementalProgramUsesExternalRuntimeStyles: false,
      }),
    ).toBe(false);

    const afterFirstPaint = {
      ...liveReloadWatch,
      initialCompilationDone: true,
    };
    expect(shouldEnableExternalRuntimeStyles(afterFirstPaint)).toBe(true);
    expect(
      shouldDiscardIncrementalProgram({
        externalRuntimeStylesNowEnabled: true,
        incrementalProgramUsesExternalRuntimeStyles: false,
      }),
    ).toBe(true);

    expect(
      shouldDiscardIncrementalProgram({
        externalRuntimeStylesNowEnabled: true,
        incrementalProgramUsesExternalRuntimeStyles: true,
      }),
    ).toBe(false);
  });
});
