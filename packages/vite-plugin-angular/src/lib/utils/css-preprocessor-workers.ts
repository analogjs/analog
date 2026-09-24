type ProcessHandle = {
  spawnfile?: string;
  spawnargs?: string[];
  stdin?: { unref?: () => void };
  stdout?: { unref?: () => void };
  stderr?: { unref?: () => void };
  stdio?: Array<{ unref?: () => void } | null | undefined>;
  unref?: () => void;
};

const PREPROCESSOR_PROCESS_RE =
  /sass-embedded|dart-sass|sass\.snapshot|[\\/]lessc(?:$|[\s])|[\\/]stylus(?:$|[\s])/i;

function getActiveHandles(): ProcessHandle[] {
  const getHandles = (
    process as NodeJS.Process & { _getActiveHandles?: () => ProcessHandle[] }
  )._getActiveHandles;
  return typeof getHandles === 'function' ? getHandles.call(process) : [];
}

function isCssPreprocessorProcess(handle: ProcessHandle): boolean {
  const haystack = `${handle.spawnfile ?? ''} ${(handle.spawnargs ?? []).join(
    ' ',
  )}`;
  return PREPROCESSOR_PROCESS_RE.test(haystack);
}

/**
 * Vite's `preprocessCSS` may spawn a fallback Sass/Less/Stylus compiler
 * (`alwaysFakeWorkerWorkerControllerCache`) that is never closed. Unref those
 * child processes so a one-off `vite build` can return the shell.
 */
export function releaseCssPreprocessorWorkers(): void {
  for (const handle of getActiveHandles()) {
    if (!isCssPreprocessorProcess(handle)) {
      continue;
    }

    for (const stream of handle.stdio ?? []) {
      stream?.unref?.();
    }
    handle.stdin?.unref?.();
    handle.stdout?.unref?.();
    handle.stderr?.unref?.();
    handle.unref?.();
  }
}
