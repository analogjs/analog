import type { ResourceDependencies } from './resource-dependencies.js';
import type { CompilerHost } from '@angular/compiler-cli';
import {
  createStylesheetTransform,
  type NativeStylesheetCompiler,
} from './stylesheet-pipeline.js';
import { normalizePath } from 'vite';

import ts from 'typescript';

import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  normalizeStylesheetDependencies,
  type StylePreprocessor,
} from './style-preprocessor.js';
import {
  AnalogStylesheetRegistry,
  preprocessStylesheetResult,
  registerStylesheetContent,
} from './stylesheet-registry.js';
import { debugStyles } from './utils/debug.js';
import type { SourceFileCache } from './utils/source-file-cache.js';

export function augmentHostWithResources(
  host: ts.CompilerHost,
  transform: NativeStylesheetCompiler,
  options: {
    inlineStylesExtension: string;
    isProd?: boolean;
    externalizeInlineStyles?: boolean;
    stylesheetRegistry?: AnalogStylesheetRegistry;
    sourceFileCache?: SourceFileCache;
    stylePreprocessor?: StylePreprocessor;
    styleDependencies?: ResourceDependencies;
  },
): void {
  const resourceHost: CompilerHost = host;

  resourceHost.readResource = async function (fileName: string) {
    const filePath = normalizePath(fileName);

    const content = host.readFile(filePath);

    if (content === undefined) {
      throw new Error('Unable to locate component resource: ' + fileName);
    }

    return content;
  };

  resourceHost.getModifiedResourceFiles = function () {
    return options?.sourceFileCache?.modifiedFiles;
  };

  const renderStylesheet = createStylesheetTransform(
    transform,
    options.styleDependencies,
  );
  resourceHost.transformResource = async function (data, context) {
    if (context.type !== 'style') return null;
    const content = await renderStylesheet({
      data,
      containingFile: context.containingFile,
      resourceFile: context.resourceFile ?? undefined,
      className: context.className,
      order: context.order,
      inlineStylesExtension: options.inlineStylesExtension,
      registry:
        context.resourceFile || options.externalizeInlineStyles !== false
          ? options.stylesheetRegistry
          : undefined,
      preprocessor: options.stylePreprocessor,
    });
    return content === undefined ? null : { content };
  };

  resourceHost.resourceNameToFileName = function (
    resourceName,
    containingFile,
    fallbackResolve,
  ) {
    // Angular's fallbackResolve callback expects (resourceUrl, containingFile),
    // NOT (directory, resourceName). Use it correctly or fall back to
    // path.join for simple relative paths.
    let resolved: string | null = null;
    if (fallbackResolve) {
      resolved = fallbackResolve(path.dirname(containingFile), resourceName);
    }
    const resolvedPath = normalizePath(
      resolved ?? path.join(path.dirname(containingFile), resourceName),
    );

    // All resource names that have template file extensions are assumed to be templates
    if (!options.stylesheetRegistry || !hasStyleExtension(resolvedPath)) {
      return resolvedPath;
    }

    // Register the hash-based external mapping so the resolveId hook can
    // resolve Angular's compiled stylesheet references back to the source.
    const externalId = createHash('sha256').update(resolvedPath).digest('hex');
    const filename = externalId + path.extname(resolvedPath);

    options.stylesheetRegistry.registerExternalRequest(filename, resolvedPath);
    debugStyles('NgtscProgram: external stylesheet ID mapped for resolveId', {
      resourceName,
      resolvedPath,
      filename,
    });

    // Return the real path so Angular can read the file during analysis.
    // Previously, returning the hash-based filename caused "Could not find
    // stylesheet file" errors because the hash doesn't exist on disk,
    // preventing AOT compilation for any component with styleUrls. (#2293)
    return resolvedPath;
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
