/**
 * Analog liveReload compiler flags.
 *
 * `_enableHmr` is on for every watch compilation so already-loaded modules
 * can accept `angular:component-update` payloads.
 *
 * `externalRuntimeStyles` is *not* applied to the first compilation. Those
 * styles are injected as `<link>` tags only after JS runs, so `:host` rules
 * are missing (or invalid) on first paint and the layout flashes until the
 * stylesheets arrive. The initial emit therefore inlines and encapsulates
 * styles the normal Angular way. Later compilations (file edits) turn
 * external styles on so CSS can hot-update independently.
 */
export interface LiveReloadCompilerFlags {
  liveReload: boolean;
  watchMode: boolean;
  /**
   * True after the first successful watch compilation has finished.
   * External runtime styles start on the *next* compilation.
   */
  initialCompilationDone: boolean;
}

export function shouldEnableExternalRuntimeStyles(
  flags: LiveReloadCompilerFlags,
): boolean {
  return flags.liveReload && flags.watchMode && flags.initialCompilationDone;
}

/**
 * Switching `externalRuntimeStyles` on a reused NgtscProgram is unsafe.
 *
 * The incremental program keeps the first-compile flags
 * (`externalRuntimeStyles: false`) and still preloads `styleUrl`s. The new
 * host, however, remaps those urls to hash filenames that do not exist on
 * disk. Angular then throws:
 * `Unable to locate component resource: <hash>.scss`.
 *
 * Discard the incremental program/host once, on the first compile that
 * enables external styles. Later rebuilds can reuse that fresh program.
 */
export function shouldDiscardIncrementalProgram(state: {
  externalRuntimeStylesNowEnabled: boolean;
  incrementalProgramUsesExternalRuntimeStyles: boolean;
}): boolean {
  return (
    state.externalRuntimeStylesNowEnabled &&
    !state.incrementalProgramUsesExternalRuntimeStyles
  );
}

export function applyLiveReloadCompilerOptions(
  tsCompilerOptions: Record<string, unknown>,
  flags: LiveReloadCompilerFlags,
): void {
  if (!flags.liveReload || !flags.watchMode) {
    return;
  }

  tsCompilerOptions['_enableHmr'] = true;
  // Workaround for https://github.com/angular/angular/issues/59310
  // Force extra instructions to be generated for HMR w/defer
  tsCompilerOptions['supportTestBed'] = true;

  if (shouldEnableExternalRuntimeStyles(flags)) {
    tsCompilerOptions['externalRuntimeStyles'] = true;
  }
}
