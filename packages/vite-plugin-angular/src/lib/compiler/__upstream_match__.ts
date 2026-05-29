/**
 * Minimal port of Angular's `compiler-cli/test/compliance/test_helpers/
 * expect_emit.ts` matcher — enough to compare a compiler's output against
 * an Angular golden `.js` file from `compliance/test_cases/`.
 *
 * The full upstream `expectEmit` tokenizes the expected string,
 * normalizes whitespace per-token, and offers `IDENT` plus several
 * macro families. This port keeps just what the OXC/TS-engine parity
 * suite exercises:
 *
 *  - `…` (ellipsis): match anything (including newlines).
 *  - `$X$` named placeholders: the first occurrence captures an
 *    identifier; subsequent occurrences of the same name must match
 *    the captured value verbatim.
 *  - `__AttributeMarker.<Name>__` / `__SelectorFlags.<Name>__`: replaced
 *    with the corresponding numeric enum value before matching, so the
 *    upstream golden files stay copy-paste-able.
 *
 * Not supported (intentionally — adding any of these only matters when
 * a parity fixture needs it): `// ...` comments, `IDENT`, i18n macros,
 * `QueryFlags`, the `assertIdentifiers` parameter.
 */

const ELLIPSIS = /…/;
const IDENTIFIER_PIECE = '[A-Za-z_$ɵ][\\w$ɵ]*';

// Angular's runtime enums — copied as constants here rather than imported
// from `@angular/compiler` to keep this helper free of Angular deps.
// Values pinned to `packages/core/src/render3/interfaces/{node,projection}.ts`
// and `packages/compiler/src/core.ts` in the Angular monorepo.
const ATTRIBUTE_MARKERS: Record<string, number> = {
  NamespaceURI: 0,
  Classes: 1,
  Styles: 2,
  Bindings: 3,
  Template: 4,
  ProjectAs: 5,
  I18n: 6,
};

const SELECTOR_FLAGS: Record<string, number> = {
  NOT: 1,
  ATTRIBUTE: 2,
  ELEMENT: 4,
  CLASS: 8,
};

function expandMacros(expected: string): string {
  return expected
    .replace(/__AttributeMarker\.([A-Za-z]+)__/g, (_match, name) => {
      const v = ATTRIBUTE_MARKERS[name];
      if (v == null) throw new Error(`Unknown AttributeMarker: ${name}`);
      return String(v);
    })
    .replace(/__SelectorFlags\.([A-Za-z]+)__/g, (_match, name) => {
      const v = SELECTOR_FLAGS[name];
      if (v == null) throw new Error(`Unknown SelectorFlag: ${name}`);
      return String(v);
    });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect whether a token (already-escaped or a named-group regex) starts
 * with what would be an identifier/number/string character in the actual
 * source. Used to decide between `\s+` (mandatory separator) and `\s*`
 * (optional) between two emitted tokens.
 */
function isWordlike(escaped: string): boolean {
  // A named capture group `(?<name>...)` matches identifiers — wordlike.
  if (escaped.startsWith('(?<')) return true;
  if (escaped.startsWith('\\k<')) return true;
  // Strip leading regex backslash escape if present.
  const first = escaped.startsWith('\\') ? escaped[1] : escaped[0];
  return /[A-Za-z0-9_$]/.test(first);
}

function joinTokens(tokens: string[]): string {
  if (tokens.length === 0) return '';
  const parts: string[] = [tokens[0]];
  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const next = tokens[i];
    parts.push(isWordlike(prev) && isWordlike(next) ? '\\s+' : '\\s*');
    parts.push(next);
  }
  return parts.join('');
}

export interface UpstreamMatchResult {
  ok: boolean;
  /** Short reason for the failure, with the chunk that failed first. */
  reason?: string;
  /** Identifiers captured by `$X$` placeholders during a successful match. */
  captures?: Record<string, string>;
}

/**
 * Match `actual` against an Angular-golden-style `expected` string.
 *
 * Matching is ordered (each chunk between `…` markers must appear in
 * the same order as in the expected string) but tolerant of arbitrary
 * intervening content. Whitespace inside a chunk collapses to `\s*`.
 *
 * Returns the first chunk that failed so the failure message is
 * actionable.
 */
export function matchUpstream(
  actual: string,
  expected: string,
): UpstreamMatchResult {
  expected = expandMacros(expected);

  // Split into chunks separated by `…`. A leading or trailing chunk
  // that is pure whitespace contributes no constraint, so drop empties.
  const rawChunks = expected.split(ELLIPSIS);
  const chunks = rawChunks.map((c) => c.trim()).filter((c) => c.length > 0);

  const captures: Record<string, string> = {};
  let cursor = 0;

  // Token classes — kept aligned with Angular's `expect_emit.ts` TOKEN
  // regex so emit-equivalent inputs tokenize the same way.
  const PLACEHOLDER = /^\$([A-Za-z_][\w]*)\$/;
  const COMMENT_START = /^\/\*/;
  const COMMENT_END = /^\*\//;
  const IDENT = /^[A-Za-z_$ɵ][\w$ɵ]*/;
  const NUMBER = /^\d+(?:\.\d+)?/;
  const STRING_SQ = /^'(?:\\.|[^'\\])*'/;
  const STRING_DQ = /^"(?:\\.|[^"\\])*"/;
  const OPERATOR =
    /^(?:\.\.\.|=>|===|!==|==|!=|<=|>=|<<|>>|&&|\|\||\+\+|--|[!?%*\/^&|(){}\[\]:;<>=+,.\-@`])/;

  for (const chunk of chunks) {
    const localGroups = new Set<string>();
    const tokens: string[] = [];
    let i = 0;
    while (i < chunk.length) {
      // Skip whitespace.
      if (/\s/.test(chunk[i])) {
        i++;
        continue;
      }
      const rest = chunk.slice(i);

      const placeholder = rest.match(PLACEHOLDER);
      if (placeholder) {
        const name = placeholder[1];
        const seen = captures[name];
        if (seen !== undefined) {
          tokens.push(escapeRegExp(seen));
        } else if (localGroups.has(name)) {
          tokens.push(`\\k<${name}>`);
        } else {
          tokens.push(`(?<${name}>${IDENTIFIER_PIECE})`);
          localGroups.add(name);
        }
        i += placeholder[0].length;
        continue;
      }

      // Order matters: `*/` and `/*` must be tried before single-char OPERATOR.
      const m =
        rest.match(COMMENT_END) ||
        rest.match(COMMENT_START) ||
        rest.match(IDENT) ||
        rest.match(NUMBER) ||
        rest.match(STRING_SQ) ||
        rest.match(STRING_DQ) ||
        rest.match(OPERATOR);
      if (!m) {
        return {
          ok: false,
          reason: `unrecognized token at "${rest.slice(0, 20)}…" in chunk "${chunk.slice(0, 60)}"`,
        };
      }
      tokens.push(escapeRegExp(m[0]));
      i += m[0].length;
    }

    // Tokens are separated by `\s*` so the same emit with different
    // formatting (e.g. `/* @__PURE__ */` vs `/*@__PURE__*/`) still
    // matches. Adjacent identifiers/numbers/strings get a mandatory
    // `\s+` (otherwise `static ɵfac` would match `staticɵfac`).
    const re = new RegExp(joinTokens(tokens));
    const slice = actual.slice(cursor);
    const m = re.exec(slice);
    if (!m) {
      const context = slice.slice(0, 200).replace(/\s+/g, ' ');
      return {
        ok: false,
        reason: `chunk did not match: "${chunk.slice(0, 80).replace(/\s+/g, ' ')}"\n  after cursor: "${context}…"`,
      };
    }
    cursor += m.index + m[0].length;
    if (m.groups) {
      for (const [name, val] of Object.entries(m.groups)) {
        if (val !== undefined) captures[name] = val;
      }
    }
  }

  return { ok: true, captures };
}
