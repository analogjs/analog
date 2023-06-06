/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import type {
  OnStartResult,
  PartialMessage,
  PartialNote,
  Plugin,
  PluginBuild,
} from 'esbuild';
import { platform } from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ts from 'typescript';
import { CompilerPluginOptions } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin';
import { maxWorkers } from '@angular-devkit/build-angular/src/utils/environment-options';
import { AotCompilation } from '@angular-devkit/build-angular/src/tools/esbuild/angular/aot-compilation';
import { JitCompilation } from '@angular-devkit/build-angular/src/tools/esbuild/angular/jit-compilation';
import { AngularHostOptions } from '@angular-devkit/build-angular/src/tools/esbuild/angular/angular-host';
import { JavaScriptTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/javascript-transformer';

/**
 * Converts TypeScript Diagnostic related information into an esbuild compatible note object.
 * Related information is a subset of a full TypeScript Diagnostic and also used for diagnostic
 * notes associated with the main Diagnostic.
 * @param info The TypeScript diagnostic relative information to convert.
 * @returns An esbuild diagnostic message as a PartialMessage object
 */
function convertTypeScriptDiagnosticInfo(
  info: ts.DiagnosticRelatedInformation,
  textPrefix?: string
): PartialNote {
  const newLine = platform() === 'win32' ? '\r\n' : '\n';
  let text = ts.flattenDiagnosticMessageText(info.messageText, newLine);
  if (textPrefix) {
    text = textPrefix + text;
  }

  const note: PartialNote = { text };

  if (info.file) {
    note.location = {
      file: info.file.fileName,
      length: info.length,
    };

    // Calculate the line/column location and extract the full line text that has the diagnostic
    if (info.start) {
      const { line, character } = ts.getLineAndCharacterOfPosition(
        info.file,
        info.start
      );
      note.location.line = line + 1;
      note.location.column = character;

      // The start position for the slice is the first character of the error line
      const lineStartPosition = ts.getPositionOfLineAndCharacter(
        info.file,
        line,
        0
      );

      // The end position for the slice is the first character of the next line or the length of
      // the entire file if the line is the last line of the file (getPositionOfLineAndCharacter
      // will error if a nonexistent line is passed).
      const { line: lastLineOfFile } = ts.getLineAndCharacterOfPosition(
        info.file,
        info.file.text.length - 1
      );
      const lineEndPosition =
        line < lastLineOfFile
          ? ts.getPositionOfLineAndCharacter(info.file, line + 1, 0)
          : info.file.text.length;

      note.location.lineText = info.file.text
        .slice(lineStartPosition, lineEndPosition)
        .trimEnd();
    }
  }

  return note;
}

/**
 * Converts a TypeScript Diagnostic message into an esbuild compatible message object.
 * @param diagnostic The TypeScript diagnostic to convert.
 * @returns An esbuild diagnostic message as a PartialMessage object
 */
function convertTypeScriptDiagnostic(
  diagnostic: ts.Diagnostic
): PartialMessage {
  let codePrefix = 'TS';
  let code = `${diagnostic.code}`;
  if (diagnostic.source === 'ngtsc') {
    codePrefix = 'NG';
    // Remove `-99` Angular prefix from diagnostic code
    code = code.slice(3);
  }

  const message: PartialMessage = {
    ...convertTypeScriptDiagnosticInfo(diagnostic, `${codePrefix}${code}: `),
    // Store original diagnostic for reference if needed downstream
    detail: diagnostic,
  };

  if (diagnostic.relatedInformation?.length) {
    message.notes = diagnostic.relatedInformation.map((info) =>
      convertTypeScriptDiagnosticInfo(info)
    );
  }

  return message;
}

// eslint-disable-next-line max-lines-per-function
export function createCompilerPlugin(
  pluginOptions: CompilerPluginOptions
): Plugin {
  let handleJs = false;

  return {
    name: 'angular-compiler',
    // eslint-disable-next-line max-lines-per-function
    async setup(build: PluginBuild): Promise<void> {
      let setupWarnings: PartialMessage[] | undefined = [];

      // Initialize a worker pool for JavaScript transformations
      const javascriptTransformer = new JavaScriptTransformer(
        pluginOptions,
        maxWorkers
      );

      const { GLOBAL_DEFS_FOR_TERSER_WITH_AOT } =
        await AotCompilation.loadCompilerCli();

      // Setup defines based on the values provided by the Angular compiler-cli
      build.initialOptions.define ??= {};
      for (const [key, value] of Object.entries(
        GLOBAL_DEFS_FOR_TERSER_WITH_AOT
      )) {
        if (key in build.initialOptions.define) {
          // Skip keys that have been manually provided
          continue;
        }
        if (key === 'ngDevMode') {
          // ngDevMode is already set based on the builder's script optimization option
          continue;
        }
        // esbuild requires values to be a string (actual strings need to be quoted).
        // In this case, all provided values are booleans.
        build.initialOptions.define[key] = value!.toString();
      }

      // The in-memory cache of TypeScript file outputs will be used during the build in `onLoad` callbacks for TS files.
      // A string value indicates direct TS/NG output and a Uint8Array indicates fully transformed code.
      const typeScriptFileCache =
        pluginOptions.sourceFileCache?.typeScriptFileCache ??
        new Map<string, string | Uint8Array>();

      build.onStart(async () => {
        const result: OnStartResult = {
          warnings: setupWarnings,
        };

        // Create Angular compiler host options
        const hostOptions: AngularHostOptions = {
          fileReplacements: pluginOptions.fileReplacements,
          modifiedFiles: pluginOptions.sourceFileCache?.modifiedFiles,
          sourceFileCache: pluginOptions.sourceFileCache,
          async transformStylesheet() {
            return null;
          },
        };

        // Create new compilation if first build; otherwise, use existing for rebuilds
        const compilation = pluginOptions?.jit
          ? new JitCompilation()
          : new AotCompilation();

        // Initialize the Angular compilation for the current build.
        // In watch mode, previous build state will be reused.
        const {
          affectedFiles,
          compilerOptions: { allowJs },
        } = await compilation.initialize(
          pluginOptions.tsconfig,
          hostOptions,
          (compilerOptions) => {
            if (
              compilerOptions.target === undefined ||
              compilerOptions.target < ts.ScriptTarget.ES2022
            ) {
              // If 'useDefineForClassFields' is already defined in the users project leave the value as is.
              // Otherwise fallback to false due to https://github.com/microsoft/TypeScript/issues/45995
              // which breaks the deprecated `@Effects` NGRX decorator and potentially other existing code as well.
              compilerOptions.target = ts.ScriptTarget.ES2022;
              compilerOptions.useDefineForClassFields ??= false;

              (setupWarnings ??= []).push({
                text:
                  'TypeScript compiler options "target" and "useDefineForClassFields" are set to "ES2022" and ' +
                  '"false" respectively by the Angular CLI.',
                location: { file: pluginOptions.tsconfig },
                notes: [
                  {
                    text:
                      'To control ECMA version and features use the Browerslist configuration. ' +
                      'For more information, see https://angular.io/guide/build#configuring-browser-compatibility',
                  },
                ],
              });
            }

            return {
              ...compilerOptions,
              noEmitOnError: false,
              inlineSources: pluginOptions.sourcemap,
              inlineSourceMap: pluginOptions.sourcemap,
              mapRoot: undefined,
              sourceRoot: undefined,
            };
          }
        );

        handleJs = allowJs;

        // Clear affected files from the cache (if present)
        if (pluginOptions.sourceFileCache) {
          for (const affected of affectedFiles) {
            pluginOptions.sourceFileCache.typeScriptFileCache.delete(
              pathToFileURL(affected.fileName).href
            );
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const diagnostic of compilation.collectDiagnostics()) {
          const message = convertTypeScriptDiagnostic(diagnostic);

          if (diagnostic.category === ts.DiagnosticCategory.Error) {
            (result.errors ??= []).push(message);
          } else {
            (result.warnings ??= []).push(message);
          }
        }

        for (const { filename, contents } of compilation.emitAffectedFiles()) {
          typeScriptFileCache.set(pathToFileURL(filename).href, contents);
        }

        // Reset the setup warnings so that they are only shown during the first build.
        setupWarnings = undefined;

        return result;
      });

      build.onLoad(
        {
          filter: handleJs ? /\.[cm]?[jt]sx?$/ : /\.[cm]?tsx?$/,
        },
        async (args) => {
          const request =
            pluginOptions.fileReplacements?.[args.path] ?? args.path;

          // only process dependencies
          if (!request.includes('node_modules')) {
            return undefined;
          }

          // The filename is currently used as a cache key. Since the cache is memory only,
          // the options cannot change and do not need to be represented in the key. If the
          // cache is later stored to disk, then the options that affect transform output
          // would need to be added to the key as well as a check for any change of content.
          let contents = pluginOptions.sourceFileCache?.typeScriptFileCache.get(
            pathToFileURL(request).href
          );

          if (contents === undefined) {
            // No TS result indicates the file is not part of the TypeScript program.
            // If allowJs is enabled and the file is JS then defer to the next load hook.
            if (!handleJs && /\.[cm]?js$/.test(request)) {
              return undefined;
            }

            // Otherwise return an error
            return {
              errors: [
                createMissingFileError(
                  request,
                  args.path,
                  build.initialOptions.absWorkingDir ?? ''
                ),
              ],
            };
          } else if (typeof contents === 'string') {
            // A string indicates untransformed output from the TS/NG compiler
            contents = await javascriptTransformer.transformData(
              request,
              contents,
              true /* skipLinker */
            );

            // Store as the returned Uint8Array to allow caching the fully transformed code
            typeScriptFileCache.set(pathToFileURL(request).href, contents);
          }

          return {
            contents,
            loader: 'js',
          };
        }
      );

      build.onLoad({ filter: /\.[cm]?js$/ }, async (args) => {
        // only process dependencies
        if (!args.path.includes('node_modules')) {
          return undefined;
        }

        // The filename is currently used as a cache key. Since the cache is memory only,
        // the options cannot change and do not need to be represented in the key. If the
        // cache is later stored to disk, then the options that affect transform output
        // would need to be added to the key as well as a check for any change of content.
        let contents = pluginOptions.sourceFileCache?.babelFileCache.get(
          args.path
        );

        if (contents === undefined) {
          contents = await javascriptTransformer.transformFile(args.path);
          pluginOptions.sourceFileCache?.babelFileCache.set(
            args.path,
            contents
          );
        }

        return {
          contents,
          loader: 'js',
        };
      });
    },
  };
}

function createMissingFileError(
  request: string,
  original: string,
  root: string
): PartialMessage {
  const error = {
    text: `File '${path.relative(
      root,
      request
    )}' is missing from the TypeScript compilation.`,
    notes: [
      {
        text: `Ensure the file is part of the TypeScript program via the 'files' or 'include' property.`,
      },
    ],
  };

  if (request !== original) {
    error.notes.push({
      text: `File is requested from a file replacement of '${path.relative(
        root,
        original
      )}'.`,
    });
  }

  return error;
}
