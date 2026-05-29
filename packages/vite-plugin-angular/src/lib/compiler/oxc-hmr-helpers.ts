/* ───────────────────────────────────────────────────────────────────────────
 * TEMPORARY: inline copy of OXC vite plugin's decorator-field helpers.
 *
 * Upstream source:
 *   @oxc-angular/vite@0.0.30 → vite-plugin/utils/decorator-fields.ts
 *   @oxc-angular/vite@0.0.30 → vite-plugin/index.ts (the three top-level
 *                              helpers at the bottom of the file)
 *
 * These functions back the OXC engine's HMR dispatch — detecting "inline
 * template/styles-only" edits and serving per-component update modules
 * through the `@ng/component` virtual-module middleware.
 *
 * They aren't on `@oxc-angular/vite/api` yet; per the OXC-equivalents rule
 * we'd rather import them than reimplement, but the upstream export needs
 * to land first. Until then this is a near-verbatim copy with a TODO to
 * delete the file the moment those exports ship.
 *
 * TODO(oxc-engine): replace this file's exports with a re-export from
 * `@oxc-angular/vite/api` once the helpers are public. Tracking issue:
 * file alongside the chained-queries follow-up.
 * ─────────────────────────────────────────────────────────────────────── */

// -----------------------------------------------------------------
// Internal types
// -----------------------------------------------------------------

type Ctx = 'paren' | 'array' | 'brace' | 'sq' | 'dq' | 'tpl';

const OPEN_TO_CTX: Record<string, Ctx> = {
  '(': 'paren',
  '[': 'array',
  '{': 'brace',
  "'": 'sq',
  '"': 'dq',
  '`': 'tpl',
};

const CLOSER_TO_CTX: Record<string, Ctx> = {
  ')': 'paren',
  ']': 'array',
  '}': 'brace',
};

const WS_RE = /\s/;
const ASCII_WORD_RE = /[A-Za-z0-9_$]/;
const IDENT_START_RE = /[\p{L}_$]/u;
const IDENT_CONT_RE = /[\p{L}\p{N}_$]/u;
const STYLES_OPENERS = '\'"`[';
const TEMPLATE_OPENERS = '\'"`';

function skipComment(code: string, i: number, end: number): number {
  if (code[i] !== '/') return -1;
  const next = code[i + 1];
  if (next === '/') {
    let j = i + 2;
    while (j < end && code[j] !== '\n') j++;
    return j;
  }
  if (next === '*') {
    let j = i + 2;
    while (j < end - 1 && !(code[j] === '*' && code[j + 1] === '/')) j++;
    return Math.min(j + 2, end);
  }
  return -1;
}

function advanceOneToken(
  code: string,
  i: number,
  stack: Ctx[],
  end: number,
): number {
  const top = stack[stack.length - 1];
  const ch = code[i];

  if (top === 'sq' || top === 'dq') {
    if (ch === '\\') return i + 2;
    if ((top === 'sq' && ch === "'") || (top === 'dq' && ch === '"')) {
      stack.pop();
    }
    return i + 1;
  }

  if (top === 'tpl') {
    if (ch === '\\') return i + 2;
    if (ch === '`') {
      stack.pop();
      return i + 1;
    }
    if (ch === '$' && code[i + 1] === '{') {
      stack.push('brace');
      return i + 2;
    }
    return i + 1;
  }

  const afterComment = skipComment(code, i, end);
  if (afterComment !== -1) return afterComment;

  const opener = OPEN_TO_CTX[ch];
  if (opener) {
    stack.push(opener);
    return i + 1;
  }

  const closerCtx = CLOSER_TO_CTX[ch];
  if (closerCtx && top === closerCtx) {
    stack.pop();
  }
  return i + 1;
}

function findClosingDelim(code: string, openIdx: number): number {
  const initial = OPEN_TO_CTX[code[openIdx]];
  if (!initial) return -1;

  const stack: Ctx[] = [initial];
  let i = openIdx + 1;
  while (i < code.length && stack.length > 0) {
    const next = advanceOneToken(code, i, stack, code.length);
    if (stack.length === 0) {
      return next - 1;
    }
    i = next;
  }
  return -1;
}

function emptyDelimitedRange(code: string, range: [number, number]): string {
  const [start, end] = range;
  return code.slice(0, start + 1) + code.slice(end);
}

function isFieldKeyAt(
  code: string,
  position: number,
  field: string,
  limit: number,
): boolean {
  if (position + field.length > limit) return false;
  if (!code.startsWith(field, position)) return false;
  const prev = position > 0 ? code[position - 1] : '';
  if (prev && ASCII_WORD_RE.test(prev)) return false;
  const next = code[position + field.length];
  if (next !== undefined && ASCII_WORD_RE.test(next)) return false;
  return true;
}

function locateFieldInsideArgs(
  code: string,
  argsRange: [number, number],
  field: string,
  openerChars: string,
): [number, number] | null {
  const [openParen, closeParen] = argsRange;
  const stack: Ctx[] = ['paren'];
  let i = openParen + 1;

  while (i < closeParen) {
    if (
      stack.length === 2 &&
      stack[1] === 'brace' &&
      isFieldKeyAt(code, i, field, closeParen)
    ) {
      let j = i + field.length;
      while (j < closeParen && WS_RE.test(code[j])) j++;
      if (code[j] === ':') {
        j++;
        while (j < closeParen && WS_RE.test(code[j])) j++;
        if (j < closeParen && openerChars.includes(code[j])) {
          const end = findClosingDelim(code, j);
          if (end !== -1 && end < closeParen) return [j, end];
        }
      }
    }
    i = advanceOneToken(code, i, stack, closeParen);
  }
  return null;
}

export interface ComponentDecorator {
  argsRange: [number, number];
  className: string;
}

function findClassName(
  code: string,
  start: number,
  end: number,
): string | null {
  let i = start;
  while (i < end) {
    const afterComment = skipComment(code, i, end);
    if (afterComment !== -1) {
      i = afterComment;
      continue;
    }

    const ch = code[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const close = findClosingDelim(code, i);
      i = close === -1 ? end : close + 1;
      continue;
    }

    if (code.startsWith('class', i)) {
      const prev = i > 0 ? code[i - 1] : '';
      const afterKw = code[i + 5] ?? '';
      if (
        (prev === '' || !IDENT_CONT_RE.test(prev)) &&
        (afterKw === '' || !IDENT_CONT_RE.test(afterKw))
      ) {
        let j = i + 5;
        while (j < end && WS_RE.test(code[j])) j++;
        if (j < end && IDENT_START_RE.test(code[j])) {
          const idStart = j;
          j++;
          while (j < end && IDENT_CONT_RE.test(code[j])) j++;
          return code.slice(idStart, j);
        }
      }
    }

    i++;
  }
  return null;
}

export function locateComponentDecorators(code: string): ComponentDecorator[] {
  type Found = {
    decoratorStart: number;
    openParen: number;
    closeParen: number;
  };
  const decoratorRe = /@Component\s*\(/g;
  const found: Found[] = [];
  let m: RegExpExecArray | null;
  while ((m = decoratorRe.exec(code)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const closeParen = findClosingDelim(code, openParen);
    if (closeParen === -1) continue;
    found.push({ decoratorStart: m.index, openParen, closeParen });
  }

  const out: ComponentDecorator[] = [];
  for (let i = 0; i < found.length; i++) {
    const { openParen, closeParen } = found[i];
    const scanEnd =
      i + 1 < found.length ? found[i + 1].decoratorStart : code.length;
    const className = findClassName(code, closeParen + 1, scanEnd);
    if (className !== null) {
      out.push({ argsRange: [openParen, closeParen], className });
    }
  }
  return out;
}

export function locateStylesInArgs(
  code: string,
  argsRange: [number, number],
): [number, number] | null {
  return locateFieldInsideArgs(code, argsRange, 'styles', STYLES_OPENERS);
}

function locateTemplateInArgs(
  code: string,
  argsRange: [number, number],
): [number, number] | null {
  return locateFieldInsideArgs(code, argsRange, 'template', TEMPLATE_OPENERS);
}

function locateStylesFieldFor(
  code: string,
  className: string,
): [number, number] | null {
  const found = locateComponentDecorators(code).find(
    (d) => d.className === className,
  );
  return found ? locateStylesInArgs(code, found.argsRange) : null;
}

function locateTemplateStringFor(
  code: string,
  className: string,
): [number, number] | null {
  const found = locateComponentDecorators(code).find(
    (d) => d.className === className,
  );
  return found ? locateTemplateInArgs(code, found.argsRange) : null;
}

// -----------------------------------------------------------------
// Public API (mirrors OXC's `vite-plugin/index.ts` bottom)
// -----------------------------------------------------------------

export function extractInlineTemplate(
  code: string,
  className: string,
): string | null {
  const range = locateTemplateStringFor(code, className);
  if (!range) return null;
  return code.slice(range[0] + 1, range[1]);
}

export function extractInlineStyles(
  code: string,
  className: string,
): string[] | null {
  const range = locateStylesFieldFor(code, className);
  if (!range) return null;
  const opener = code[range[0]];
  if (opener !== '[') {
    return [code.slice(range[0] + 1, range[1])];
  }
  const body = code.slice(range[0] + 1, range[1]);
  const stringRe = /`([\s\S]*?)`|'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g;
  const styles: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = stringRe.exec(body)) !== null) {
    styles.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return styles.length > 0 ? styles : null;
}

export function stripComponentMetadata(code: string): string {
  const decorators = locateComponentDecorators(code);
  const ranges: Array<[number, number]> = [];
  for (const d of decorators) {
    const tpl = locateTemplateInArgs(code, d.argsRange);
    if (tpl) ranges.push(tpl);
    const styles = locateStylesInArgs(code, d.argsRange);
    if (styles) ranges.push(styles);
  }
  ranges.sort((a, b) => b[0] - a[0]);
  return ranges.reduce((acc, range) => emptyDelimitedRange(acc, range), code);
}
