import type { CompilerHost } from '@angular/compiler-cli';
import { normalizePath } from 'vite';

import * as ts from 'typescript';

import { createHash } from 'node:crypto';
import path from 'node:path';
import type { SourceFileCache } from './utils/source-file-cache.js';
import { EXCLUDED_TS_EXT_REGEX, TS_EXT_REGEX } from './utils/plugin-config.js';

export function augmentHostWithModuleResolution(
  host: ts.CompilerHost,
  options: ts.CompilerOptions,
): void {
  const resolutionCache = ts.createModuleResolutionCache(
    host.getCurrentDirectory(),
    host.getCanonicalFileName.bind(host),
    options,
  );
  host.getModuleResolutionCache = () => resolutionCache;
  host.resolveModuleNameLiterals = (
    literals,
    containingFile,
    redirectedReference,
    compilerOptions,
    containingSourceFile,
  ) =>
    literals.map((literal) => {
      const resolution: ts.ResolvedModuleWithFailedLookupLocations =
        ts.resolveModuleName(
          literal.text,
          containingFile,
          compilerOptions,
          host,
          resolutionCache,
          redirectedReference,
          ts.getModeForUsageLocation(
            containingSourceFile,
            literal,
            compilerOptions,
          ),
        );
      const resolvedModule = resolution.resolvedModule;
      if (
        resolvedModule?.isExternalLibraryImport &&
        TS_EXT_REGEX.test(resolvedModule.resolvedFileName) &&
        !EXCLUDED_TS_EXT_REGEX.test(resolvedModule.resolvedFileName) &&
        !normalizePath(resolvedModule.resolvedFileName).includes(
          '/node_modules/',
        )
      ) {
        // A workspace symlink resolves to source outside node_modules.
        // Classify it before program creation so TypeScript emits it.
        return {
          ...resolution,
          resolvedModule: {
            ...resolvedModule,
            isExternalLibraryImport: false,
          },
        };
      }
      return resolution;
    });
}

export function augmentHostWithResources(
  host: ts.CompilerHost,
  transform: (
    code: string,
    id: string,
    options?: { ssr?: boolean },
  ) => ReturnType<any> | null,
  options: {
    inlineStylesExtension: string;
    isProd?: boolean;
    inlineComponentStyles?: Map<string, string>;
    externalComponentStyles?: Map<string, string>;
    sourceFileCache?: SourceFileCache;
  },
) {
  const resourceHost = host as CompilerHost;

  resourceHost.readResource = async function (fileName: string) {
    const filePath = normalizePath(fileName);

    let content = (this as any).readFile(filePath);

    if (content === undefined) {
      throw new Error('Unable to locate component resource: ' + fileName);
    }

    return content;
  };

  resourceHost.getModifiedResourceFiles = function () {
    return options?.sourceFileCache?.modifiedFiles;
  };

  resourceHost.transformResource = async function (data, context) {
    // Only style resources are supported currently
    if (context.type !== 'style') {
      return null;
    }

    if (options.inlineComponentStyles) {
      const id = createHash('sha256')
        .update(context.containingFile)
        .update(context.className)
        .update(String(context.order))
        .update(data)
        .digest('hex');
      const filename = id + '.' + options.inlineStylesExtension;
      options.inlineComponentStyles.set(filename, data);
      return { content: filename };
    }

    // Resource file only exists for external stylesheets
    const filename =
      context.resourceFile ??
      context.containingFile.replace(
        '.ts',
        `.${options?.inlineStylesExtension}`,
      );

    let stylesheetResult;

    try {
      stylesheetResult = await transform(data, `${filename}?direct`);
    } catch (e) {
      console.error(`${e}`);
    }

    return { content: stylesheetResult?.code || '' };
  };

  resourceHost.resourceNameToFileName = function (
    resourceName,
    containingFile,
  ) {
    const resolvedPath = path.join(path.dirname(containingFile), resourceName);

    // All resource names that have template file extensions are assumed to be templates
    if (!options.externalComponentStyles || !hasStyleExtension(resolvedPath)) {
      return resolvedPath;
    }

    // For external stylesheets, create a unique identifier and store the mapping
    let externalId = options.externalComponentStyles.get(resolvedPath);
    externalId ??= createHash('sha256').update(resolvedPath).digest('hex');

    const filename = externalId + path.extname(resolvedPath);

    options.externalComponentStyles.set(filename, resolvedPath);

    return filename;
  };
}

export function augmentProgramWithVersioning(program: ts.Program): void {
  const baseGetSourceFiles = program.getSourceFiles;
  program.getSourceFiles = function (...parameters) {
    const files: readonly (ts.SourceFile & { version?: string })[] =
      baseGetSourceFiles(...parameters);

    for (const file of files) {
      file.version ??= createHash('sha256').update(file.text).digest('hex');
    }

    return files;
  };
}

export function augmentHostWithCaching(
  host: ts.CompilerHost,
  cache: Map<string, ts.SourceFile>,
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
      ...parameters,
    );

    if (file) {
      cache.set(fileName, file);
    }

    return file;
  };
}

export function mergeTransformers(
  first: ts.CustomTransformers,
  second: ts.CustomTransformers,
): ts.CustomTransformers {
  const result: ts.CustomTransformers = {};

  if (first.before || second.before) {
    result.before = [...(first.before || []), ...(second.before || [])];
  }

  if (first.after || second.after) {
    result.after = [...(first.after || []), ...(second.after || [])];
  }

  if (first.afterDeclarations || second.afterDeclarations) {
    result.afterDeclarations = [
      ...(first.afterDeclarations || []),
      ...(second.afterDeclarations || []),
    ];
  }

  return result;
}

function hasStyleExtension(file: string): boolean {
  const extension = path.extname(file).toLowerCase();

  switch (extension) {
    case '.css':
    case '.scss':
      return true;
    default:
      return false;
  }
}
