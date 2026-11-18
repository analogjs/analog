/**
 * Cached parsing and lowering of `.tsrx` modules, shared by registry scans and
 * compiles so each source is parsed once.
 */

import { parseModule, parseStyle } from '@tsrx/core';

import {
  type EstreeNode,
  lowerTsrx,
  type TsrxLoweringResult,
  type TsrxParsers,
  type TsrxSelectorResolver,
} from './lower.js';
import { remapSourceMap, type TsrxSourceMap } from './source-map.js';

/** Vite transform filter pattern for `.tsrx` modules. */
export const TSRX_GLOB = '**/*.tsrx';

/** Whether a module id (possibly with a query) is a `.tsrx` module. */
export function isTsrxFile(id: string): boolean {
  const path = id.split('?')[0];
  return path.endsWith('.tsrx');
}

const parsers: TsrxParsers = {
  parseModule: (source, fileName) => parseModule(source, fileName),
  // `location` only seeds the stylesheet hash, which the lowering doesn't use.
  parseStyle: (css) =>
    parseStyle(css, { filename: '', line: 0, column: 0 }, {}),
};

/** Per-file cache of parse and lowering results, keyed by the source text. */
interface CachedModule {
  source: string;
  /** The TSRX parse, or the error it threw. */
  parsed?: { program: EstreeNode } | { error: unknown };
  /** A lowering made for registry scanning, with placeholder tag selectors. */
  scan?: { result: TsrxLoweringResult; resolvedSelectors: boolean };
  /** The latest lowering made for compilation. */
  compiled?: TsrxLoweringResult;
}

const modules = new Map<string, CachedModule>();

function cachedModule(fileName: string, source: string): CachedModule {
  let entry = modules.get(fileName);
  if (entry === undefined || entry.source !== source) {
    entry = { source };
    modules.set(fileName, entry);
  }
  return entry;
}

/** Parsers whose `parseModule` parses `entry`'s source at most once. */
function cachingParsers(entry: CachedModule, fileName: string): TsrxParsers {
  return {
    parseModule: (source, file) => {
      if (file !== fileName || source !== entry.source) {
        return parsers.parseModule(source, file);
      }
      if (entry.parsed === undefined) {
        try {
          entry.parsed = { program: parsers.parseModule(source, file) };
        } catch (error) {
          entry.parsed = { error };
        }
      }
      if ('error' in entry.parsed) {
        throw entry.parsed.error;
      }
      return entry.parsed.program;
    },
    parseStyle: parsers.parseStyle,
  };
}

/**
 * The module specifiers a `.tsrx` module imports or re-exports, read from its
 * (cached) parse. Returns none when the module fails to parse; the lowering
 * reports that error.
 */
export async function tsrxImportSpecifiers(
  code: string,
  fileName: string,
): Promise<string[]> {
  const entry = cachedModule(fileName, code);
  let program: EstreeNode;
  try {
    program = cachingParsers(entry, fileName).parseModule(code, fileName);
  } catch {
    return [];
  }
  const specifiers: string[] = [];
  for (const stmt of program.body as EstreeNode[]) {
    const isImport =
      stmt.type === 'ImportDeclaration' && stmt.importKind !== 'type';
    const isReExport =
      (stmt.type === 'ExportNamedDeclaration' ||
        stmt.type === 'ExportAllDeclaration') &&
      stmt.source &&
      stmt.exportKind !== 'type';
    if ((isImport || isReExport) && typeof stmt.source.value === 'string') {
      specifiers.push(stmt.source.value);
    }
  }
  return specifiers;
}

/**
 * Lowers a `.tsrx` module for registry scanning: the resulting TypeScript
 * declares the same classes, selectors, inputs and outputs as the compiled
 * module. Template tags don't matter to the scanner, so the module's latest
 * compile lowering is reused when there is one; otherwise tags resolve to a
 * placeholder.
 */
export async function lowerTsrxForScan(
  code: string,
  fileName: string,
): Promise<TsrxLoweringResult> {
  const entry = cachedModule(fileName, code);
  if (entry.compiled) {
    return entry.compiled;
  }
  if (entry.scan === undefined) {
    let resolvedSelectors = false;
    const result = lowerTsrx(code, fileName, cachingParsers(entry, fileName), {
      resolveSelector: () => {
        resolvedSelectors = true;
        return 'tsrx-unresolved';
      },
    });
    entry.scan = { result, resolvedSelectors };
  }
  return entry.scan.result;
}

/**
 * Lowers a `.tsrx` module for compilation. Selectors of imported components
 * can change while this module's source doesn't, so the module is lowered again
 * on every call, unless its scan lowering resolved no selectors at all, in which
 * case that lowering already is the final output.
 */
export async function lowerTsrxModule(
  code: string,
  fileName: string,
  resolver: TsrxSelectorResolver,
): Promise<TsrxLoweringResult> {
  const entry = cachedModule(fileName, code);
  entry.compiled =
    entry.scan && !entry.scan.resolvedSelectors
      ? entry.scan.result
      : lowerTsrx(code, fileName, cachingParsers(entry, fileName), resolver);
  return entry.compiled;
}

/** Formats lowering diagnostics as `file:line:column - message` with a code frame. */
export function formatTsrxDiagnostics(
  result: TsrxLoweringResult,
  source: string,
  fileName: string,
): string {
  return result.diagnostics
    .map((d) => {
      const { line, column } = lineAndColumn(source, d.start);
      const frameLine = lineText(source, d.start);
      const width = Math.max(1, Math.min(d.end, source.length) - d.start);
      const underline =
        ' '.repeat(column) +
        '~'.repeat(Math.min(width, Math.max(1, frameLine.length - column)));
      return `${fileName}:${line + 1}:${column + 1} - ${d.message}\n\n${frameLine}\n${underline}`;
    })
    .join('\n\n');
}

/** The first diagnostic's location, for Vite's `this.error({ loc })`. */
export function firstDiagnosticLoc(
  result: TsrxLoweringResult,
  source: string,
  fileName: string,
): { file: string; line: number; column: number } | undefined {
  const first = result.diagnostics[0];
  if (first === undefined) {
    return undefined;
  }
  const { line, column } = lineAndColumn(source, first.start);
  return { file: fileName, line: line + 1, column };
}

/**
 * Points a source map produced for the lowered TypeScript back at the original
 * `.tsrx`, including `sourcesContent`.
 */
export function remapTsrxSourceMap(
  map: string | { [key: string]: unknown },
  sourceMap: TsrxSourceMap,
): { [key: string]: unknown } {
  const json = typeof map === 'string' ? map : JSON.stringify(map);
  const remapped = JSON.parse(remapSourceMap(json, sourceMap));
  remapped.sourcesContent ??= [sourceMap.originalText];
  return remapped;
}

function lineAndColumn(
  source: string,
  offset: number,
): { line: number; column: number } {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    const ch = source[i];
    if (ch === '\n' || (ch === '\r' && source[i + 1] !== '\n')) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart };
}

/** The text of the line containing `offset`. */
function lineText(source: string, offset: number): string {
  let start = offset;
  while (
    start > 0 &&
    source[start - 1] !== '\n' &&
    source[start - 1] !== '\r'
  ) {
    start--;
  }
  let end = offset;
  while (end < source.length && source[end] !== '\n' && source[end] !== '\r') {
    end++;
  }
  return source.slice(start, end);
}
