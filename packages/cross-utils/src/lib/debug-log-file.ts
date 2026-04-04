import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { format } from 'node:util';
import type { Debugger } from 'obug';

const TRUNCATED_KEY = '__analogDebugLogTruncated';
const WRAPPED_KEY = '__analogFileLogWrapped';
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B\[[0-9;]*[A-Za-z]|\x1B\].*?\x07/g;

export const DEBUG_LOG_DIR = 'tmp/debug';
export const DEBUG_LOG_FILENAME = 'analog.log';

function ensureTruncated(filePath: string): void {
  const g = globalThis as Record<string, unknown>;
  const truncated = (g[TRUNCATED_KEY] as Set<string>) ?? new Set<string>();
  g[TRUNCATED_KEY] = truncated;
  if (truncated.has(filePath)) return;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, '', 'utf-8');
  } catch {
    // best-effort: fall through to append mode if truncation fails
  }
  truncated.add(filePath);
}

function wrapLog(dbg: Debugger, filePath: string): void {
  const rec = dbg as Record<string, unknown>;
  if (rec[WRAPPED_KEY] === filePath) return;

  const originalLog =
    rec[WRAPPED_KEY] && rec['__analogOriginalLog']
      ? (rec['__analogOriginalLog'] as Debugger['log'])
      : dbg.log;

  rec['__analogOriginalLog'] = originalLog;
  dbg.log = function (this: Debugger, ...args: unknown[]) {
    originalLog.apply(this, args);
    try {
      const line = format(...args).replace(ANSI_RE, '') + '\n';
      appendFileSync(filePath, line, 'utf-8');
    } catch {
      // debug logging must never crash the build
    }
  };
  rec[WRAPPED_KEY] = filePath;
}

export function wrapInstancesForFileLog(
  instances: Debugger[],
  filePath: string,
): void {
  ensureTruncated(filePath);
  for (const dbg of instances) {
    wrapLog(dbg, filePath);
  }
}

function scopeToFilename(namespace: string): string {
  return namespace.replace(/:/g, '.') + '.log';
}

export function wrapInstancesForScopedFileLog(
  instances: Debugger[],
  dirPath: string,
): void {
  for (const dbg of instances) {
    const scopedPath = join(dirPath, scopeToFilename(dbg.namespace));
    ensureTruncated(scopedPath);
    wrapLog(dbg, scopedPath);
  }
}
