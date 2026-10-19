/**
 * Duplicates of this file (keep in sync):
 *   packages/platform/src/lib/utils/debug-log-file.spec.ts
 *   packages/vite-plugin-angular/src/lib/utils/debug-log-file.spec.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('obug', () => ({
  createDebug: vi.fn((ns: string) => {
    const fn: any = vi.fn();
    fn.log = vi.fn();
    fn.namespace = ns;
    return fn;
  }),
  enable: vi.fn(),
}));

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { createDebug } from 'obug';
import {
  wrapInstancesForFileLog,
  wrapInstancesForScopedFileLog,
} from './debug-log-file.js';

describe('wrapInstancesForFileLog', () => {
  beforeEach(() => {
    vi.mocked(mkdirSync).mockClear();
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(appendFileSync).mockClear();
    delete (globalThis as Record<string, unknown>)['__analogDebugLogTruncated'];
  });

  it('creates the parent directory and truncates the file on first call', () => {
    const dbg = createDebug('test:ns');
    wrapInstancesForFileLog([dbg], '/app/tmp/debug/analog.log');
    expect(mkdirSync).toHaveBeenCalledWith('/app/tmp/debug', {
      recursive: true,
    });
    expect(writeFileSync).toHaveBeenCalledWith(
      '/app/tmp/debug/analog.log',
      '',
      'utf-8',
    );
  });

  it('does not truncate on subsequent calls with the same path', () => {
    const dbg1 = createDebug('test:a');
    const dbg2 = createDebug('test:b');
    wrapInstancesForFileLog([dbg1], '/app/tmp/debug/analog.log');
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(mkdirSync).mockClear();
    wrapInstancesForFileLog([dbg2], '/app/tmp/debug/analog.log');
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('truncates a different file path independently', () => {
    const dbg1 = createDebug('test:a');
    const dbg2 = createDebug('test:b');
    wrapInstancesForFileLog([dbg1], '/app/tmp/debug/analog.log');
    vi.mocked(writeFileSync).mockClear();
    wrapInstancesForFileLog([dbg2], '/app/tmp/debug/other.log');
    expect(writeFileSync).toHaveBeenCalledWith(
      '/app/tmp/debug/other.log',
      '',
      'utf-8',
    );
  });

  it('wraps .log to append formatted output to file', () => {
    const dbg = createDebug('test:ns');
    const originalLog = dbg.log;
    wrapInstancesForFileLog([dbg], '/app/tmp/debug/analog.log');
    dbg.log('hello %s', 'world');
    expect(originalLog).toHaveBeenCalled();
    const written = vi.mocked(appendFileSync).mock.calls[0][1];
    expect(written).toContain('hello world');
  });

  it('strips ANSI codes from file output', () => {
    const dbg = createDebug('test:ns');
    wrapInstancesForFileLog([dbg], '/app/tmp/debug/analog.log');
    dbg.log('\x1B[38;5;42mcolored\x1B[0m text');
    const written = vi.mocked(appendFileSync).mock.calls[0][1];
    expect(written).not.toContain('\x1B');
    expect(written).toContain('colored text');
  });

  it('does not re-wrap when target path is unchanged', () => {
    const dbg = createDebug('test:ns');
    wrapInstancesForFileLog([dbg], '/app/tmp/debug/analog.log');
    const wrappedLog = dbg.log;
    wrapInstancesForFileLog([dbg], '/app/tmp/debug/analog.log');
    expect(dbg.log).toBe(wrappedLog);
  });

  it('re-wraps when target path changes', () => {
    const dbg = createDebug('test:ns');
    wrapInstancesForFileLog([dbg], '/app/tmp/debug/analog.log');
    const firstWrap = dbg.log;
    wrapInstancesForFileLog([dbg], '/app/tmp/debug/other.log');
    expect(dbg.log).not.toBe(firstWrap);
    dbg.log('hello');
    expect(appendFileSync).toHaveBeenCalledWith(
      '/app/tmp/debug/other.log',
      expect.stringContaining('hello'),
      'utf-8',
    );
  });

  it('does not throw when initial truncation fails', () => {
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw new Error('EROFS');
    });
    const dbg = createDebug('test:ns');
    expect(() =>
      wrapInstancesForFileLog([dbg], '/app/tmp/debug/analog.log'),
    ).not.toThrow();
  });

  it('silently ignores file write errors', () => {
    vi.mocked(appendFileSync).mockImplementation(() => {
      throw new Error('EACCES');
    });
    const dbg = createDebug('test:ns');
    wrapInstancesForFileLog([dbg], '/app/tmp/debug/analog.log');
    expect(() => dbg.log('test')).not.toThrow();
  });
});

describe('wrapInstancesForScopedFileLog', () => {
  beforeEach(() => {
    vi.mocked(mkdirSync).mockClear();
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(appendFileSync).mockClear();
    delete (globalThis as Record<string, unknown>)['__analogDebugLogTruncated'];
  });

  it('creates a separate file per instance namespace', () => {
    const dbgHmr = createDebug('analog:angular:hmr');
    const dbgStyles = createDebug('analog:angular:styles');
    wrapInstancesForScopedFileLog([dbgHmr, dbgStyles], '/app/tmp/debug');
    expect(writeFileSync).toHaveBeenCalledWith(
      '/app/tmp/debug/analog.angular.hmr.log',
      '',
      'utf-8',
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      '/app/tmp/debug/analog.angular.styles.log',
      '',
      'utf-8',
    );
  });

  it('appends to the scope-specific file on log', () => {
    const dbg = createDebug('analog:angular:hmr');
    wrapInstancesForScopedFileLog([dbg], '/app/tmp/debug');
    dbg.log('hmr update');
    expect(appendFileSync).toHaveBeenCalledWith(
      '/app/tmp/debug/analog.angular.hmr.log',
      expect.stringContaining('hmr update'),
      'utf-8',
    );
  });

  it('does not re-wrap when scoped path is unchanged', () => {
    const dbg = createDebug('analog:angular:hmr');
    wrapInstancesForScopedFileLog([dbg], '/app/tmp/debug');
    const wrappedLog = dbg.log;
    wrapInstancesForScopedFileLog([dbg], '/app/tmp/debug');
    expect(dbg.log).toBe(wrappedLog);
  });

  it('creates the directory for each scoped file', () => {
    const dbg = createDebug('analog:angular:compiler');
    wrapInstancesForScopedFileLog([dbg], '/app/tmp/debug');
    expect(mkdirSync).toHaveBeenCalledWith('/app/tmp/debug', {
      recursive: true,
    });
  });
});
