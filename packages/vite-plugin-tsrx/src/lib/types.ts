/**
 * TypeScript declarations for `.tsrx` modules.
 *
 * TypeScript can't read `.tsrx` files, so each one is lowered to TypeScript and
 * its declarations are emitted from that code, with types inferred as for any
 * `.ts` file (`input(1)` is an `InputSignal<number>`). The declarations are
 * written outside the sources, mirroring them:
 *
 *     src/app/counter.tsrx  ->  <outDir>/src/app/counter.d.tsrx.ts
 *
 * With `allowArbitraryExtensions`, TypeScript looks up `./counter.tsrx` as
 * `./counter.d.tsrx.ts`, and `rootDirs: [".", "<outDir>"]` lets it find that
 * file in `outDir`:
 *
 *     {
 *       "compilerOptions": {
 *         "allowArbitraryExtensions": true,
 *         "rootDirs": [".", "node_modules/.analog/tsrx-types"]
 *       }
 *     }
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

import { lowerTsrxForScan } from './cache.js';
import type { TsrxSourceMap } from './source-map.js';

/** Where declarations go by default, relative to the tsconfig's directory. */
export const DEFAULT_TSRX_TYPES_DIR = 'node_modules/.analog/tsrx-types';

const DECLARATION_SUFFIX = '.d.tsrx.ts';

export interface TsrxTypesOptions {
  /** The tsconfig whose compiler options the declarations are emitted with. */
  tsconfig: string;
  /**
   * Output directory, relative to the tsconfig's directory.
   * Default: `node_modules/.analog/tsrx-types`.
   */
  outDir?: string;
}

export interface TsrxTypeDiagnostic {
  fileName: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  message: string;
}

export interface TsrxTypesResult {
  /** Declaration files written because they were new or changed. */
  written: string[];
  /** Stale declaration files removed. */
  removed: string[];
  diagnostics: TsrxTypeDiagnostic[];
}

interface LoweredModule {
  source: string;
  code: string;
  sourceMap: TsrxSourceMap;
}

/**
 * Generates declarations for every `.tsrx` file under a tsconfig's directory.
 * Keep one generator around to regenerate after changes: it reuses the
 * previous TypeScript program.
 */
export class TsrxTypeGenerator {
  readonly rootDir: string;
  readonly outDir: string;
  private readonly tsconfig: string;
  private program: ts.Program | undefined;

  constructor(options: TsrxTypesOptions) {
    this.tsconfig = resolve(options.tsconfig);
    this.rootDir = dirname(this.tsconfig);
    this.outDir = resolve(
      this.rootDir,
      options.outDir ?? DEFAULT_TSRX_TYPES_DIR,
    );
  }

  /** The `.tsrx` files under the tsconfig's directory, outside `node_modules`. */
  findTsrxFiles(): string[] {
    return ts.sys
      .readDirectory(this.rootDir, ['.tsrx'], ['**/node_modules', '**/dist'])
      .map((f) => resolve(f))
      .sort();
  }

  async generate(): Promise<TsrxTypesResult> {
    const diagnostics: TsrxTypeDiagnostic[] = [];
    const lowered = new Map<string, LoweredModule>();
    for (const file of this.findTsrxFiles()) {
      const source = readFileSync(file, 'utf8');
      const result = await lowerTsrxForScan(source, file);
      if (result.diagnostics.length > 0) {
        for (const d of result.diagnostics) {
          diagnostics.push({
            fileName: file,
            ...position(source, d.start),
            message: d.message,
          });
        }
        continue;
      }
      lowered.set(virtualName(file), {
        source,
        code: result.code,
        sourceMap: result.sourceMap,
      });
    }

    const options = this.compilerOptions();
    const host = this.compilerHost(options, lowered);
    this.program = ts.createProgram({
      rootNames: [...lowered.keys()],
      options,
      host,
      oldProgram: this.program,
    });

    const declarations = new Map<string, string>();
    for (const name of lowered.keys()) {
      const sourceFile = this.program.getSourceFile(name);
      if (sourceFile === undefined) continue;
      const emit = this.program.emit(
        sourceFile,
        (_fileName, text) => declarations.set(this.declarationPath(name), text),
        undefined,
        /* emitOnlyDtsFiles */ true,
      );
      for (const d of emit.diagnostics) {
        diagnostics.push(toTsrxDiagnostic(d, lowered));
      }
    }

    // Files that failed to lower keep their previous declarations, so one
    // syntax error doesn't turn every import of the file into an error.
    const keep = new Set(declarations.keys());
    for (const d of diagnostics) {
      keep.add(this.declarationPath(virtualName(d.fileName)));
    }

    const written: string[] = [];
    for (const [path, text] of declarations) {
      if (existsSync(path) && readFileSync(path, 'utf8') === text) continue;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      written.push(path);
    }
    const removed = listDeclarations(this.outDir).filter(
      (path) => !keep.has(path),
    );
    for (const path of removed) {
      rmSync(path);
    }
    return { written, removed, diagnostics };
  }

  private compilerOptions(): ts.CompilerOptions {
    const parsed = ts.getParsedCommandLineOfConfigFile(
      this.tsconfig,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (d) => {
          throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
        },
      },
    );
    if (parsed === undefined) {
      throw new Error(`Could not read ${this.tsconfig}.`);
    }
    return {
      ...parsed.options,
      declaration: true,
      emitDeclarationOnly: true,
      noEmit: false,
      noEmitOnError: false,
      // `$fc` and other lowering internals are marked `@internal`.
      stripInternal: true,
      declarationMap: false,
      sourceMap: false,
      inlineSourceMap: false,
      composite: false,
      incremental: false,
      tsBuildInfoFile: undefined,
      outDir: undefined,
      declarationDir: undefined,
      rootDir: undefined,
      outFile: undefined,
    };
  }

  /** A host that serves each `.tsrx` file's lowered code as `<file>.tsrx.ts`. */
  private compilerHost(
    options: ts.CompilerOptions,
    lowered: Map<string, LoweredModule>,
  ): ts.CompilerHost {
    const host = ts.createCompilerHost(options, true);
    const getSourceFile = host.getSourceFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const readFile = host.readFile.bind(host);
    const resolutionCache = ts.createModuleResolutionCache(
      this.rootDir,
      host.getCanonicalFileName,
      options,
    );

    host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
      const module = lowered.get(resolve(fileName));
      return module === undefined
        ? getSourceFile(fileName, languageVersion, onError, shouldCreate)
        : ts.createSourceFile(
            fileName,
            module.code,
            languageVersion,
            true,
            ts.ScriptKind.TS,
          );
    };
    host.fileExists = (fileName) =>
      lowered.has(resolve(fileName)) || fileExists(fileName);
    host.readFile = (fileName) =>
      lowered.get(resolve(fileName))?.code ?? readFile(fileName);
    host.writeFile = () => {
      throw new Error('Declarations are written by TsrxTypeGenerator.');
    };
    // `./x.tsrx` resolves to its lowered code, wherever it is imported from.
    host.resolveModuleNameLiterals = (
      literals,
      containingFile,
      redirected,
      compilerOptions,
    ) =>
      literals.map((literal) => {
        const specifier = literal.text;
        if (specifier.startsWith('.') && specifier.endsWith('.tsrx')) {
          const target = virtualName(
            resolve(dirname(containingFile), specifier),
          );
          if (lowered.has(target)) {
            return {
              resolvedModule: {
                resolvedFileName: target,
                extension: ts.Extension.Ts,
                isExternalLibraryImport: false,
              },
            };
          }
        }
        return ts.resolveModuleName(
          specifier,
          containingFile,
          compilerOptions,
          host,
          resolutionCache,
          redirected,
        );
      });
    return host;
  }

  /** `<root>/src/x.tsrx.ts` -> `<outDir>/src/x.d.tsrx.ts`. */
  private declarationPath(virtual: string): string {
    const file = virtual.slice(0, -'.tsrx.ts'.length);
    return join(this.outDir, relative(this.rootDir, file) + DECLARATION_SUFFIX);
  }
}

/** Generates declarations once. */
export function generateTsrxTypes(
  options: TsrxTypesOptions,
): Promise<TsrxTypesResult> {
  return new TsrxTypeGenerator(options).generate();
}

/** Formats diagnostics as `file:line:column - message` lines. */
export function formatTsrxTypeDiagnostics(
  diagnostics: TsrxTypeDiagnostic[],
  cwd: string = process.cwd(),
): string {
  return diagnostics
    .map(
      (d) =>
        `${relative(cwd, d.fileName)}:${d.line}:${d.column} - ${d.message}`,
    )
    .join('\n');
}

/** The name the lowered code of a `.tsrx` file goes by in the program. */
function virtualName(tsrxFile: string): string {
  return resolve(tsrxFile) + '.ts';
}

function listDeclarations(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith(DECLARATION_SUFFIX),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

function position(
  source: string,
  offset: number,
): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/** Points a diagnostic on lowered code back at the `.tsrx` source, where it can. */
function toTsrxDiagnostic(
  d: ts.Diagnostic,
  lowered: Map<string, LoweredModule>,
): TsrxTypeDiagnostic {
  const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
  const fileName = d.file?.fileName;
  const module =
    fileName === undefined ? undefined : lowered.get(resolve(fileName));
  if (fileName === undefined || d.start === undefined) {
    return { fileName: fileName ?? '', line: 1, column: 1, message };
  }
  if (module === undefined) {
    const { line, character } = ts.getLineAndCharacterOfPosition(
      d.file!,
      d.start,
    );
    return { fileName, line: line + 1, column: character + 1, message };
  }
  const original = module.sourceMap.toOriginalOffset(d.start);
  return {
    fileName: fileName.slice(0, -'.ts'.length),
    ...position(module.source, original ?? 0),
    message,
  };
}
