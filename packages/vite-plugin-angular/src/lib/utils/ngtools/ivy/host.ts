/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/* eslint-disable @typescript-eslint/unbound-method */
import { createHash } from 'crypto';
import * as ts from 'typescript';
import { normalizePath } from './paths.js';

function augmentResolveModuleNames(
  host: ts.CompilerHost,
  resolvedModuleModifier: (
    resolvedModule: ts.ResolvedModule | undefined,
    moduleName: string
  ) => ts.ResolvedModule | undefined,
  moduleResolutionCache?: ts.ModuleResolutionCache
): void {
  if (host.resolveModuleNames) {
    const baseResolveModuleNames = host.resolveModuleNames;
    host.resolveModuleNames = function (moduleNames: string[], ...parameters) {
      return moduleNames.map((name) => {
        const result = baseResolveModuleNames.call(host, [name], ...parameters);

        return resolvedModuleModifier(result[0], name);
      });
    };
  } else {
    host.resolveModuleNames = function (
      moduleNames: string[],
      containingFile: string,
      _reusedNames: string[] | undefined,
      redirectedReference: ts.ResolvedProjectReference | undefined,
      options: ts.CompilerOptions
    ) {
      return moduleNames.map((name) => {
        const result = ts.resolveModuleName(
          name,
          containingFile,
          options,
          host,
          moduleResolutionCache,
          redirectedReference
        ).resolvedModule;

        return resolvedModuleModifier(result, name);
      });
    };
  }
}

/**
 * Augments a TypeScript Compiler Host's resolveModuleNames function to collect dependencies
 * of the containing file passed to the resolveModuleNames function. This process assumes
 * that consumers of the Compiler Host will only call resolveModuleNames with modules that are
 * actually present in a containing file.
 * This process is a workaround for gathering a TypeScript SourceFile's dependencies as there
 * is no currently exposed public method to do so. A BuilderProgram does have a `getAllDependencies`
 * function. However, that function returns all transitive dependencies as well which can cause
 * excessive Webpack rebuilds.
 *
 * @param host The CompilerHost to augment.
 * @param dependencies A Map which will be used to store file dependencies.
 * @param moduleResolutionCache An optional resolution cache to use when the host resolves a module.
 */
export function augmentHostWithDependencyCollection(
  host: ts.CompilerHost,
  dependencies: Map<string, Set<string>>,
  moduleResolutionCache?: ts.ModuleResolutionCache
): void {
  if (host.resolveModuleNames) {
    const baseResolveModuleNames = host.resolveModuleNames;
    host.resolveModuleNames = function (
      moduleNames: string[],
      containingFile: string,
      ...parameters
    ) {
      const results = baseResolveModuleNames.call(
        host,
        moduleNames,
        containingFile,
        ...parameters
      );

      const containingFilePath = normalizePath(containingFile);
      for (const result of results) {
        if (result) {
          const containingFileDependencies =
            dependencies.get(containingFilePath);
          if (containingFileDependencies) {
            containingFileDependencies.add(result.resolvedFileName);
          } else {
            dependencies.set(
              containingFilePath,
              new Set([result.resolvedFileName])
            );
          }
        }
      }

      return results;
    };
  } else {
    host.resolveModuleNames = function (
      moduleNames: string[],
      containingFile: string,
      _reusedNames: string[] | undefined,
      redirectedReference: ts.ResolvedProjectReference | undefined,
      options: ts.CompilerOptions
    ) {
      return moduleNames.map((name) => {
        const result = ts.resolveModuleName(
          name,
          containingFile,
          options,
          host,
          moduleResolutionCache,
          redirectedReference
        ).resolvedModule;

        if (result) {
          const containingFilePath = normalizePath(containingFile);
          const containingFileDependencies =
            dependencies.get(containingFilePath);
          if (containingFileDependencies) {
            containingFileDependencies.add(result.resolvedFileName);
          } else {
            dependencies.set(
              containingFilePath,
              new Set([result.resolvedFileName])
            );
          }
        }

        return result;
      });
    };
  }
}

export function augmentHostWithReplacements(
  host: ts.CompilerHost,
  replacements: Record<string, string>,
  moduleResolutionCache?: ts.ModuleResolutionCache
): void {
  if (Object.keys(replacements).length === 0) {
    return;
  }

  const normalizedReplacements: Record<string, string> = {};
  for (const [key, value] of Object.entries(replacements)) {
    normalizedReplacements[normalizePath(key)] = normalizePath(value);
  }

  const tryReplace = (resolvedModule: ts.ResolvedModule | undefined) => {
    const replacement =
      resolvedModule && normalizedReplacements[resolvedModule.resolvedFileName];
    if (replacement) {
      return {
        resolvedFileName: replacement,
        isExternalLibraryImport: /[/\\]node_modules[/\\]/.test(replacement),
      };
    } else {
      return resolvedModule;
    }
  };

  augmentResolveModuleNames(host, tryReplace, moduleResolutionCache);
}

export function augmentProgramWithVersioning(program: ts.Program): void {
  const baseGetSourceFiles = program.getSourceFiles;
  program.getSourceFiles = function (...parameters) {
    const files: readonly (ts.SourceFile & { version?: string })[] =
      baseGetSourceFiles(...parameters);

    for (const file of files) {
      if (file.version === undefined) {
        file.version = createHash('sha256').update(file.text).digest('hex');
      }
    }

    return files;
  };
}

export function augmentHostWithCaching(
  host: ts.CompilerHost,
  cache: Map<string, ts.SourceFile>
): void {
  const baseGetSourceFile = host.getSourceFile;
  host.getSourceFile = function (
    fileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
    ...parameters
  ) {
    if (!shouldCreateNewSourceFile && cache.has(fileName)) {
      return cache.get(fileName);
    }

    const file = baseGetSourceFile.call(
      host,
      fileName,
      languageVersion,
      onError,
      true,
      ...parameters
    );

    if (file) {
      cache.set(fileName, file);
    }

    return file;
  };
}
