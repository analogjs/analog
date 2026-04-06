import type { CompilerHost } from '@angular/compiler-cli';
import { normalizePath } from 'vite';

import * as ts from 'typescript';

import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  normalizeStylesheetDependencies,
  type StylePreprocessor,
} from '@analogjs/style-pipeline/style-preprocessor';
import {
  AnalogStylesheetRegistry,
  preprocessStylesheetResult,
  registerStylesheetContent,
} from './stylesheet-registry.js';
import { debugStyles } from './utils/debug.js';
import type { SourceFileCache } from './utils/source-file-cache.js';

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
    stylesheetRegistry?: AnalogStylesheetRegistry;
    sourceFileCache?: SourceFileCache;
    stylePreprocessor?: StylePreprocessor;
  },
): void {
  const resourceHost = host as CompilerHost;

  resourceHost.readResource = async function (fileName: string) {
    const filePath = normalizePath(fileName);

    const content = (this as any).readFile(filePath);

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

    const filename =
      context.resourceFile ??
      context.containingFile.replace(
        '.ts',
        `.${options?.inlineStylesExtension}`,
      );
    const preprocessed = preprocessStylesheetResult(
      data,
      filename,
      options.stylePreprocessor,
      {
        filename,
        containingFile: context.containingFile,
        resourceFile: context.resourceFile ?? undefined,
        className: context.className,
        order: context.order,
        inline: !context.resourceFile,
      },
    );

    // Externalized path: store preprocessed CSS for Vite's serve-time pipeline.
    // CSS must NOT be transformed here — the load hook returns it into
    // Vite's transform pipeline where PostCSS / Tailwind process it once.
    if (options.stylesheetRegistry) {
      const stylesheetId = registerStylesheetContent(
        options.stylesheetRegistry,
        {
          code: preprocessed.code,
          dependencies: normalizeStylesheetDependencies(
            preprocessed.dependencies,
          ),
          diagnostics: preprocessed.diagnostics,
          tags: preprocessed.tags,
          containingFile: context.containingFile,
          className: context.className,
          order: context.order,
          inlineStylesExtension: options.inlineStylesExtension,
          resourceFile: context.resourceFile ?? undefined,
        },
      );
      debugStyles('NgtscProgram: stylesheet deferred to Vite pipeline', {
        stylesheetId,
        resourceFile: context.resourceFile ?? '(inline)',
        dependencies: preprocessed.dependencies,
        diagnostics: preprocessed.diagnostics,
        tags: preprocessed.tags,
      });
      return { content: stylesheetId };
    }

    // Non-externalized: CSS is returned directly to the Angular compiler
    // and never re-enters Vite's pipeline, so transform eagerly.
    debugStyles('NgtscProgram: stylesheet processed inline via transform', {
      filename,
      resourceFile: context.resourceFile ?? '(inline)',
      dataLength: preprocessed.code.length,
    });
    let stylesheetResult;

    try {
      stylesheetResult = await transform(
        preprocessed.code,
        `${filename}?direct`,
      );
    } catch (e) {
      debugStyles('NgtscProgram: stylesheet transform error', {
        filename,
        resourceFile: context.resourceFile ?? '(inline)',
        error: String(e),
      });
    }

    if (!stylesheetResult?.code) {
      return null;
    }

    return { content: stylesheetResult.code };
  };

  resourceHost.resourceNameToFileName = function (
    resourceName,
    containingFile,
    fallbackResolve,
  ) {
    const resolvedPath = normalizePath(
      fallbackResolve
        ? fallbackResolve(path.dirname(containingFile), resourceName)
        : path.join(path.dirname(containingFile), resourceName),
    );

    // All resource names that have template file extensions are assumed to be templates
    if (!options.stylesheetRegistry || !hasStyleExtension(resolvedPath)) {
      return resolvedPath;
    }

    // For external stylesheets, create a unique identifier and store the mapping
    const externalId = createHash('sha256').update(resolvedPath).digest('hex');
    const filename = externalId + path.extname(resolvedPath);

    options.stylesheetRegistry.registerExternalRequest(filename, resolvedPath);
    debugStyles('NgtscProgram: external stylesheet ID mapped for resolveId', {
      resourceName,
      resolvedPath,
      filename,
    });

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
