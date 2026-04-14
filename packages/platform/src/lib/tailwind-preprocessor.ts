import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { StylePreprocessor } from './style-preprocessor.js';
import { debugTailwind } from './utils/debug.js';

export type TailwindPreprocessorMode = 'auto' | 'disabled' | { prefix: string };
const PLATFORM_TAILWIND_PREFIX = '[@analogjs/platform]';
const CSS_REFERENCE_DIRECTIVE_REGEX = /(^|[;}\n\r])\s*@reference\b/m;
const CSS_TAILWIND_IMPORT_REGEX =
  /(^|[;}\n\r])\s*@import\s+["']tailwindcss["']/m;

interface CssTailwindDirectiveState {
  commentlessCode: string;
  hasReferenceDirective: boolean;
  hasReferenceText: boolean;
  hasTailwindImportDirective: boolean;
}

// Mask real block comments while preserving quoted CSS content. This keeps
// prose like `/* add @reference here */` from disabling injection without
// mistaking `/* ... */` sequences inside strings for real comments.
function stripCssBlockComments(code: string): string {
  let result = '';
  let quote: '"' | "'" | '`' | null = null;

  for (let index = 0; index < code.length; index++) {
    const character = code[index];
    const nextCharacter = code[index + 1];

    if (quote) {
      if (character === '\\' && nextCharacter) {
        result += character;
        result += nextCharacter;
        index++;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      result += character;
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      result += character;
      continue;
    }

    if (character === '/' && nextCharacter === '*') {
      result += '  ';
      index += 2;

      while (index < code.length) {
        const commentCharacter = code[index];
        const commentNextCharacter = code[index + 1];

        if (commentCharacter === '*' && commentNextCharacter === '/') {
          result += '  ';
          index++;
          break;
        }

        result +=
          commentCharacter === '\n' || commentCharacter === '\r'
            ? commentCharacter
            : ' ';
        index++;
      }
      continue;
    }

    result += character;
  }

  return result;
}

function hasReferenceTextInComments(code: string): boolean {
  let quote: '"' | "'" | '`' | null = null;

  for (let index = 0; index < code.length; index++) {
    const character = code[index];
    const nextCharacter = code[index + 1];

    if (quote) {
      if (character === '\\' && nextCharacter) {
        index++;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }

    if (character === '/' && nextCharacter === '*') {
      const commentStart = index + 2;
      index += 2;

      while (index < code.length) {
        const commentCharacter = code[index];
        const commentNextCharacter = code[index + 1];

        if (commentCharacter === '*' && commentNextCharacter === '/') {
          break;
        }
        index++;
      }

      if (code.slice(commentStart, index).includes('@reference')) {
        return true;
      }
    }
  }

  return false;
}

function inspectCssTailwindDirectives(code: string): CssTailwindDirectiveState {
  const commentlessCode = stripCssBlockComments(code);

  return {
    commentlessCode,
    hasReferenceDirective: CSS_REFERENCE_DIRECTIVE_REGEX.test(commentlessCode),
    hasReferenceText: hasReferenceTextInComments(code),
    hasTailwindImportDirective: CSS_TAILWIND_IMPORT_REGEX.test(commentlessCode),
  };
}

function toReferenceSpecifier(
  filename: string,
  tailwindRootCss: string,
): string {
  const fromDir = path.posix.dirname(filename.replace(/\\/g, '/'));
  const toFile = tailwindRootCss.replace(/\\/g, '/');
  const relativePath = path.posix.relative(fromDir, toFile);

  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function throwTailwindReferenceTextError(
  filename: string,
  referenceSpecifier: string,
): never {
  throw new Error(
    `${PLATFORM_TAILWIND_PREFIX} Tailwind @reference auto-injection was ` +
      `blocked for "${filename}" because the stylesheet contains the ` +
      `text "@reference" but does not contain a real @reference ` +
      `directive.\n\n` +
      `This is usually caused by a CSS comment such as ` +
      `"/* ... @reference ... */".\n\n` +
      `Fix one of:\n` +
      `  - Reword the comment so it does not contain "@reference"\n` +
      `  - Add a real @reference "${referenceSpecifier}"; directive\n`,
  );
}

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
    const directiveState = inspectCssTailwindDirectives(code);

    if (directiveState.hasReferenceDirective) {
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
      directiveState.hasTailwindImportDirective;
    const hasTailwindUsage = resolvedPrefix
      ? directiveState.commentlessCode.includes(`${resolvedPrefix}:`)
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

    const refPath = toReferenceSpecifier(filename, tailwindRootCss);
    if (directiveState.hasReferenceText) {
      throwTailwindReferenceTextError(filename, refPath);
    }

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
