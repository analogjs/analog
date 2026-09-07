import { stripQuery, splitComponentId } from './module-id.js';
/**
 * Shared utilities used by both angular-vite-plugin.ts and
 * compilation-api/compilation-api-plugin.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizePath } from 'vite';

import {
  AnalogStylesheetRegistry,
  preprocessStylesheetResult,
  rewriteRelativeCssImports,
} from '../stylesheet-registry.js';
import { normalizeStylesheetDependencies } from '../style-preprocessor.js';
import type { StylePreprocessor } from '../style-preprocessor.js';
import type { FileReplacement } from '../plugins/file-replacements.plugin.js';
import { debugStylesV } from './debug.js';
import { stylesheetFailure } from '../stylesheet-pipeline.js';

export enum DiagnosticModes {
  None = 0,
  Option = 1 << 0,
  Syntactic = 1 << 1,
  Semantic = 1 << 2,
  All = Option | Syntactic | Semantic,
}

export function injectViteIgnoreForHmrMetadata(code: string): string {
  let patched = code.replace(
    /\bimport\(([a-zA-Z_$][\w$]*\.\u0275\u0275getReplaceMetadataURL)/g,
    'import(/* @vite-ignore */ $1',
  );

  if (patched === code) {
    patched = patched.replace(
      /import\((\S+getReplaceMetadataURL)/g,
      'import(/* @vite-ignore */ $1',
    );
  }

  return patched;
}

export function isIgnoredHmrFile(file: string): boolean {
  return file.endsWith('.tsbuildinfo');
}

/**
 * Convert Analog/Angular CLI-style file replacements into the flat record
 * expected by `AngularHostOptions.fileReplacements`.
 *
 * Only browser replacements (`{ replace, with }`) are converted. SSR-only
 * replacements (`{ replace, ssr }`) are left for the Vite runtime plugin to
 * handle — they should not be baked into the Angular compilation host because
 * that would apply them to both browser and server builds.
 *
 * Relative paths are resolved against `workspaceRoot` so that the host
 * receives the same absolute paths it would get from the Angular CLI.
 */
export function toAngularCompilationFileReplacements(
  replacements: FileReplacement[],
  workspaceRoot: string,
): Record<string, string> | undefined {
  const mappedReplacements = replacements.flatMap((replacement) => {
    if (!('with' in replacement)) {
      return [];
    }

    return [
      [
        isAbsolute(replacement.replace)
          ? replacement.replace
          : resolve(workspaceRoot, replacement.replace),
        isAbsolute(replacement.with)
          ? replacement.with
          : resolve(workspaceRoot, replacement.with),
      ] as const,
    ];
  });

  return mappedReplacements.length
    ? Object.fromEntries(mappedReplacements)
    : undefined;
}

/**
 * Map Angular's `templateUpdates` (keyed by `encodedFilePath@ClassName`)
 * back to absolute file paths with their associated HMR code and component
 * class name.
 *
 * Angular's private Compilation API emits template update keys in the form
 * `encodeURIComponent(relativePath + '@' + className)`. We decode and resolve
 * them so the caller can look up updates by the same normalized absolute path
 * used elsewhere in the plugin (`outputFiles`, `classNames`, etc.).
 */
export function mapTemplateUpdatesToFiles(
  templateUpdates: ReadonlyMap<string, string> | undefined,
): Map<
  string,
  {
    className: string;
    code: string;
  }
> {
  const updatesByFile = new Map<string, { className: string; code: string }>();

  templateUpdates?.forEach((code, encodedUpdateId) => {
    const [file, className] = splitComponentId(encodedUpdateId);
    const resolvedFile = normalizePath(resolve(process.cwd(), file));

    updatesByFile.set(resolvedFile, {
      className,
      code,
    });
  });

  return updatesByFile;
}

export function describeStylesheetContent(code: string): {
  length: number;
  digest: string;
  preview: string;
} {
  return {
    length: code.length,
    digest: createHash('sha256').update(code).digest('hex').slice(0, 12),
    preview: code.replace(/\s+/g, ' ').trim().slice(0, 160),
  };
}

/**
 * Refreshes any already-served stylesheet records that map back to a changed
 * source file.
 *
 * This is the critical bridge for externalized Angular component styles during
 * HMR. Angular's resource watcher can notice that `/src/...component.css`
 * changed before Angular recompilation has had a chance to repopulate the
 * stylesheet registry. If we emit a CSS update against the existing virtual
 * stylesheet id without first refreshing the registry content, the browser gets
 * a hot update containing stale CSS. By rewriting the existing served records
 * from disk up front, HMR always pushes the latest source content.
 */
export function refreshStylesheetRegistryForFile(
  file: string,
  stylesheetRegistry?: AnalogStylesheetRegistry,
  stylePreprocessor?: StylePreprocessor,
): void {
  const normalizedFile = normalizePath(stripQuery(file));
  if (!stylesheetRegistry || !existsSync(normalizedFile)) {
    return;
  }

  const publicIds = stylesheetRegistry.getPublicIdsForSource(normalizedFile);
  if (publicIds.length === 0) {
    return;
  }

  const rawCss = readFileSync(normalizedFile, 'utf-8');
  let preprocessed;
  try {
    preprocessed = preprocessStylesheetResult(
      rawCss,
      normalizedFile,
      stylePreprocessor,
    );
  } catch (cause) {
    throw stylesheetFailure('preprocess', normalizedFile, cause);
  }
  const servedCss = rewriteRelativeCssImports(
    preprocessed.code,
    normalizedFile,
  );

  for (const publicId of publicIds) {
    stylesheetRegistry.registerServedStylesheet(
      {
        publicId,
        sourcePath: normalizedFile,
        originalCode: rawCss,
        normalizedCode: servedCss,
        dependencies: normalizeStylesheetDependencies(
          preprocessed.dependencies,
        ),
        diagnostics: preprocessed.diagnostics,
        tags: preprocessed.tags,
      },
      [
        normalizedFile,
        normalizePath(normalizedFile),
        normalizedFile.replace(/^\//, ''),
      ],
    );
  }

  debugStylesV('stylesheet registry refreshed from source file', {
    file: normalizedFile,
    publicIds,
    dependencies: preprocessed.dependencies,
    diagnostics: preprocessed.diagnostics,
    tags: preprocessed.tags,
    source: describeStylesheetContent(rawCss),
    served: describeStylesheetContent(servedCss),
  });
}

/**
 * Checks for vitest run from the command line
 * @returns boolean
 */
export function isTestWatchMode(
  args: readonly string[] = process.argv,
): boolean {
  // vitest --run
  const hasRun = args.find((arg) => arg.includes('--run'));
  if (hasRun) {
    return false;
  }

  // vitest run
  if (args.includes('run')) {
    return false;
  }

  // vitest --no-run
  const hasNoRun = args.find((arg) => arg.includes('--no-run'));
  if (hasNoRun) {
    return true;
  }

  // check for --watch=false or --no-watch
  const hasWatch = args.find((arg) => arg.includes('watch'));
  if (hasWatch && ['false', 'no'].some((neg) => hasWatch.includes(neg))) {
    return false;
  }

  // check for --watch false
  const watchIndex = args.findIndex((arg) => arg.includes('watch'));
  const watchArg = args[watchIndex + 1];
  if (watchArg && watchArg === 'false') {
    return false;
  }

  return true;
}

export function createCompilationMode(
  current: () => {
    watch: boolean;
    liveReload: boolean;
    hmr: boolean;
    externalizeStyles: boolean;
  },
): {
  shouldEnableLiveReload: () => boolean;
  shouldExternalizeStyles: () => boolean;
} {
  return {
    shouldEnableLiveReload: () => {
      const mode = current();
      return mode.watch && mode.liveReload && mode.hmr;
    },
    shouldExternalizeStyles: () => {
      const mode = current();
      return (
        mode.watch && ((mode.liveReload && mode.hmr) || mode.externalizeStyles)
      );
    },
  };
}
