import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { StylePreprocessor } from '@analogjs/style-pipeline/style-preprocessor';
import { debugTailwind } from './utils/debug.js';

export type TailwindPreprocessorMode = 'auto' | 'disabled' | { prefix: string };

export interface TailwindPreprocessorOptions {
  /** Absolute path to the Tailwind root CSS file that imports `tailwindcss`. */
  tailwindRootCss: string;

  /**
   * Controls whether the preprocessor auto-detects, disables, or manually
   * overrides the Tailwind prefix for a given file.
   */
  mode?:
    | TailwindPreprocessorMode
    | ((filename: string) => TailwindPreprocessorMode);

  /**
   * Optional predicate to override the default `@reference` injection behavior.
   */
  shouldInject?: (
    code: string,
    filename: string,
    resolvedPrefix: string | null,
  ) => boolean;
}

/**
 * Creates a stylesheet preprocessor that injects Tailwind v4 `@reference`
 * directives into Angular component styles when needed. The Tailwind prefix is
 * detected from the configured root CSS file.
 */
export function tailwindPreprocessor(
  options: TailwindPreprocessorOptions,
): StylePreprocessor {
  const { tailwindRootCss, mode: modeOption = 'auto', shouldInject } = options;
  let rootPrefix: string | undefined;

  debugTailwind('configured', { tailwindRootCss, mode: modeOption });

  return (code: string, filename: string): string => {
    if (code.includes('@reference')) {
      debugTailwind('skip (already has @reference)', { filename });
      return code;
    }

    const resolvedMode =
      typeof modeOption === 'function' ? modeOption(filename) : modeOption;

    if (resolvedMode === 'disabled') {
      debugTailwind('skip (mode disabled)', { filename });
      return code;
    }

    const resolvedPrefix =
      typeof resolvedMode === 'object' ? resolvedMode.prefix : getRootPrefix();
    const isRootFile =
      path.resolve(filename) === path.resolve(tailwindRootCss) ||
      /@import\s+["']tailwindcss["']/.test(code);
    const hasTailwindUsage = resolvedPrefix
      ? code.includes(`${resolvedPrefix}:`)
      : false;
    const shouldAddReference = shouldInject
      ? shouldInject(code, filename, resolvedPrefix)
      : hasTailwindUsage && !isRootFile;

    if (!shouldAddReference || !resolvedPrefix) {
      debugTailwind('skip (no injection needed)', {
        filename,
        resolvedPrefix,
        isRootFile,
        hasTailwindUsage,
      });
      return code;
    }

    const refPath = path
      .relative(path.dirname(filename), tailwindRootCss)
      .replace(/\\/g, '/');
    debugTailwind('injected @reference', { filename, refPath });

    return `@reference "${refPath}";\n${code}`;
  };

  function getRootPrefix(): string | null {
    if (rootPrefix === undefined) {
      rootPrefix = extractTailwindPrefix(
        readFileSync(tailwindRootCss, 'utf-8'),
      );
    }

    return rootPrefix;
  }
}

function extractTailwindPrefix(code: string): string | null {
  const prefixMatch = code.match(
    /@import\s+["']tailwindcss["']\s+prefix\(\s*([^)\s;]+)\s*\)/i,
  );

  return prefixMatch?.[1]?.trim() ?? null;
}
