/**
 * Glue between the TSRX lowering and the fast compile path.
 *
 * `.tsrx` modules are lowered into TypeScript with ordinary `@Component`
 * classes, then compiled by the fast compiler like any other source file.
 * TSRX is only supported on the fast compile path.
 */

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

let parsersPromise: Promise<TsrxParsers> | undefined;

/** Loads the parsers from `@tsrx/core`, an optional peer dependency. */
export function loadTsrxParsers(): Promise<TsrxParsers> {
  parsersPromise ??= import('@tsrx/core').then(
    (core): TsrxParsers => ({
      parseModule: (source, fileName) => core.parseModule(source, fileName),
      // `location` only seeds the stylesheet hash, which the lowering doesn't use.
      parseStyle: (css) =>
        core.parseStyle(css, { filename: '', line: 0, column: 0 }, {}),
    }),
    () => {
      throw new Error(
        '[@analogjs/vite-plugin-angular]: `tsrx` is enabled but `@tsrx/core` is not installed. ' +
          'Install it to compile .tsrx files.',
      );
    },
  );
  return parsersPromise;
}

/**
 * Selectors are only needed for template tags, which registry scanning ignores.
 * Lowering for a scan resolves every tag to a placeholder.
 */
const SCAN_RESOLVER: TsrxSelectorResolver = {
  resolveSelector: () => 'tsrx-unresolved',
};

/**
 * Lowers a `.tsrx` module just far enough for registry scanning and import
 * discovery: the resulting TypeScript declares the same classes, selectors,
 * inputs, outputs and imports as the real compile.
 */
export async function lowerTsrxForScan(
  code: string,
  fileName: string,
): Promise<TsrxLoweringResult> {
  return lowerTsrx(code, fileName, await loadTsrxParsers(), SCAN_RESOLVER);
}

/** Lowers a `.tsrx` module for compilation. */
export async function lowerTsrxModule(
  code: string,
  fileName: string,
  resolver: TsrxSelectorResolver,
): Promise<TsrxLoweringResult> {
  return lowerTsrx(code, fileName, await loadTsrxParsers(), resolver);
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
