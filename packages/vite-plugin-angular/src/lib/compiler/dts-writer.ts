/**
 * Inject Angular's Ivy `.d.ts` type declarations into emitted declaration
 * files for library builds — the write-side counterpart to `dts-reader.ts`.
 *
 * The OXC engine returns, per Angular class, the static member type
 * declarations that belong in the class's `.d.ts` body (e.g.
 * `static ɵcmp: i0.ɵɵComponentDeclaration<…>;`). These mirror what ngtsc's
 * `IvyDeclarationDtsTransform` emits and let consumers' template
 * type-checker understand a pre-compiled library.
 *
 * fastCompile does not generate the base `.d.ts` — a separate declaration
 * generator (rolldown-plugin-dts, vite-plugin-dts, tsdown, `tsc`) does. This
 * helper post-processes those files: it splices the Angular members into the
 * matching classes and ensures the `i0` import the members reference exists.
 *
 * Known limitation: class bodies are located with a regex that stops at the
 * first `{` after `class <Name>`. A `{` inside a type-parameter constraint or
 * default would be mistaken for the body brace. Emitted Angular library
 * declarations don't use such generics, so this is accepted to avoid pulling
 * the AST parser into the write path.
 */

/** A single class's `.d.ts` static member declarations. */
export interface DtsClassDeclaration {
  className: string;
  members: string;
}

const I0_IMPORT = 'import * as i0 from "@angular/core";';

const I0_IMPORT_RE = /import\s+\*\s+as\s+i0\s+from\s+['"]@angular\/core['"]/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Insert the `i0` namespace import after any leading triple-slash reference
 * directives and comments (which must stay at the top of a `.d.ts`).
 */
function ensureI0Import(source: string): string {
  if (I0_IMPORT_RE.test(source)) {
    return source;
  }

  const lines = source.split('\n');
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      trimmed === '' ||
      trimmed.startsWith('///') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*')
    ) {
      insertAt = i + 1;
      continue;
    }
    break;
  }

  lines.splice(insertAt, 0, I0_IMPORT);
  return lines.join('\n');
}

/**
 * Splice each declaration's static members into the matching class body in
 * `source`, ensuring the `i0` import is present when anything was injected.
 *
 * Idempotent: a declaration whose first member already appears in `source`
 * is skipped. A declaration whose class isn't found is skipped.
 */
export function injectDtsDeclarations(
  source: string,
  declarations: readonly DtsClassDeclaration[],
): string {
  if (declarations.length === 0) {
    return source;
  }

  let output = source;
  let injected = false;

  for (const { className, members } of declarations) {
    const memberLines = members
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (memberLines.length === 0) {
      continue;
    }

    if (output.includes(memberLines[0])) {
      continue;
    }

    const classBodyOpen = new RegExp(
      `(?:export\\s+)?(?:declare\\s+)?(?:abstract\\s+)?class\\s+${escapeRegExp(
        className,
      )}\\b[^{]*\\{`,
    );
    const match = classBodyOpen.exec(output);
    if (!match) {
      continue;
    }

    const insertAt = match.index + match[0].length;
    const body = '\n' + memberLines.map((line) => `    ${line}`).join('\n');
    output = output.slice(0, insertAt) + body + output.slice(insertAt);
    injected = true;
  }

  return injected ? ensureI0Import(output) : output;
}
