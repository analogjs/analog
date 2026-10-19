/**
 * Duplicates of this file (keep in sync):
 *   packages/platform/src/lib/utils/debug-harness.ts
 *   packages/vite-plugin-angular/src/lib/utils/debug-harness.ts
 */
import { join } from 'node:path';
import { enable } from 'obug';
import type { Debugger } from 'obug';

import {
  DEBUG_LOG_DIR,
  DEBUG_LOG_FILENAME,
  wrapInstancesForFileLog,
  wrapInstancesForScopedFileLog,
} from './debug-log-file.js';

export type DebugMode = 'build' | 'dev';

export interface DebugModeOptions<S extends string = string> {
  scopes?: boolean | S[];
  mode?: DebugMode;
  /**
   * Write debug output to log files under `tmp/debug/` in the workspace root.
   * - `true` or `'single'` — all output to `tmp/debug/analog.log`
   * - `'scoped'` — one file per scope, e.g. `tmp/debug/analog.angular.hmr.log`
   */
  logFile?: boolean | 'single' | 'scoped';
}

export type DebugOption<S extends string = string> =
  | boolean
  | S[]
  | DebugModeOptions<S>
  | DebugModeOptions<S>[];

export interface DebugHarness<S extends string = string> {
  applyDebugOption(
    debug: DebugOption<S> | undefined,
    workspaceRoot?: string,
  ): void;
  activateDeferredDebug(command: 'build' | 'serve'): void;
  /** @internal test-only reset */
  _resetDeferredDebug(): void;
}

function resolveNamespaces(
  scopes: boolean | string[] | undefined,
  fallback: string,
): string | null {
  if (scopes === true || scopes === undefined) return fallback;
  if (Array.isArray(scopes) && scopes.length) return scopes.join(',');
  return null;
}

function extractLogFile(
  debug: DebugOption,
): true | 'single' | 'scoped' | false {
  if (typeof debug === 'boolean') return false;
  if (Array.isArray(debug)) {
    if (debug.length === 0 || typeof debug[0] === 'string') return false;
    const entry = (debug as DebugModeOptions[]).find((e) => !!e.logFile);
    return entry?.logFile ?? false;
  }
  return (debug as DebugModeOptions).logFile ?? false;
}

export function createDebugHarness<S extends string = string>(config: {
  fallbackNamespace: string;
  instanceGroups: Debugger[][];
}): DebugHarness<S> {
  interface PendingEntry {
    entry: DebugModeOptions<S>;
    logFile: true | 'single' | 'scoped' | false;
    root: string;
  }

  let pendingDebug: PendingEntry[] = [];

  function installFileWrappers(
    logFile: true | 'single' | 'scoped',
    root: string,
  ): void {
    if (logFile === 'scoped') {
      const dirPath = join(root, DEBUG_LOG_DIR);
      for (const group of config.instanceGroups) {
        wrapInstancesForScopedFileLog(group, dirPath);
      }
    } else {
      const filePath = join(root, DEBUG_LOG_DIR, DEBUG_LOG_FILENAME);
      for (const group of config.instanceGroups) {
        wrapInstancesForFileLog(group, filePath);
      }
    }
  }

  function applyEntry(
    entry: DebugModeOptions<S>,
    fallback: string,
    logFile: true | 'single' | 'scoped' | false,
    root: string,
  ): void {
    if (!entry.mode) {
      const ns = resolveNamespaces(entry.scopes ?? true, fallback);
      if (ns) enable(ns);
      if (logFile) installFileWrappers(logFile, root);
    } else {
      pendingDebug.push({ entry, logFile, root });
    }
  }

  return {
    applyDebugOption(
      debug: DebugOption<S> | undefined,
      workspaceRoot?: string,
    ): void {
      if (debug == null || debug === false) return;

      const logFile = extractLogFile(debug);
      const root =
        workspaceRoot ?? process.env['NX_WORKSPACE_ROOT'] ?? process.cwd();

      if (typeof debug === 'boolean') {
        const ns = resolveNamespaces(debug, config.fallbackNamespace);
        if (ns) enable(ns);
        return;
      }

      if (Array.isArray(debug)) {
        if (debug.length === 0) return;

        if (typeof debug[0] === 'string') {
          const ns = (debug as string[]).join(',');
          if (ns) enable(ns);
          return;
        }

        for (const entry of debug as DebugModeOptions<S>[]) {
          const entryLogFile = entry.logFile ?? false;
          applyEntry(
            entry,
            config.fallbackNamespace,
            entryLogFile || logFile,
            root,
          );
        }
        return;
      }

      applyEntry(debug, config.fallbackNamespace, logFile, root);
    },

    activateDeferredDebug(command: 'build' | 'serve'): void {
      if (pendingDebug.length === 0) return;

      const currentMode = command === 'serve' ? 'dev' : 'build';

      for (const { entry, logFile, root } of pendingDebug) {
        if (entry.mode === currentMode) {
          const ns = resolveNamespaces(
            entry.scopes ?? true,
            config.fallbackNamespace,
          );
          if (ns) enable(ns);
          if (logFile) installFileWrappers(logFile, root);
        }
      }

      pendingDebug = [];
    },

    _resetDeferredDebug(): void {
      pendingDebug = [];
    },
  };
}
