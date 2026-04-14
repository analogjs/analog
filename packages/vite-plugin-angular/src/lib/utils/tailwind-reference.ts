const ANGULAR_TAILWIND_PREFIX = '[@analogjs/vite-plugin-angular]';
const CSS_REFERENCE_DIRECTIVE_REGEX = /(^|[;}\n\r])\s*@reference\b/m;
const CSS_TAILWIND_IMPORT_REGEX =
  /(^|[;}\n\r])\s*@import\s+["']tailwindcss["']/m;

export interface CssTailwindDirectiveState {
  commentlessCode: string;
  hasReferenceDirective: boolean;
  hasReferenceText: boolean;
  hasTailwindImportDirective: boolean;
}

export class TailwindReferenceError extends Error {
  readonly name = 'TailwindReferenceError';
}

// Match real CSS directives, not prose inside block comments. The scanner keeps
// quoted CSS content intact so `/* ... */` sequences inside strings do not get
// mistaken for real comments.
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

export function inspectCssTailwindDirectives(
  code: string,
): CssTailwindDirectiveState {
  const commentlessCode = stripCssBlockComments(code);

  return {
    commentlessCode,
    hasReferenceDirective: CSS_REFERENCE_DIRECTIVE_REGEX.test(commentlessCode),
    hasReferenceText: hasReferenceTextInComments(code),
    hasTailwindImportDirective: CSS_TAILWIND_IMPORT_REGEX.test(commentlessCode),
  };
}

export function throwTailwindReferenceTextError(
  filename: string,
  rootStylesheet: string,
): never {
  throw new TailwindReferenceError(
    `${ANGULAR_TAILWIND_PREFIX} Tailwind @reference auto-injection was ` +
      `blocked for "${filename}" because the stylesheet contains the ` +
      `text "@reference" but does not contain a real @reference ` +
      `directive.\n\n` +
      `This is usually caused by a CSS comment such as ` +
      `"/* ... @reference ... */".\n\n` +
      `Fix one of:\n` +
      `  - Reword the comment so it does not contain "@reference"\n` +
      `  - Add a real @reference "${rootStylesheet}"; directive\n`,
  );
}

export function isTailwindReferenceError(
  error: unknown,
): error is TailwindReferenceError {
  return error instanceof TailwindReferenceError;
}
