import { dirname, resolve } from 'node:path';
// OXC parser (native Rust, NAPI-RS) replaces ts-morph for AST extraction.
// It is ~10-50x faster for the narrow task of pulling property values from
// Angular component decorators.  The Visitor helper from Rolldown walks the
// ESTree-compatible AST that OXC produces.
import { parseSync } from 'oxc-parser';
import { Visitor } from 'rolldown/utils';
import { normalizePath } from 'vite';

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a string value from an ESTree AST node.
 *
 * Handles three forms that Angular decorators may use:
 * - `Literal` with a string value  → `'./foo.css'`  /  `"./foo.css"`
 * - `StringLiteral` (OXC-specific) → same representation
 * - `TemplateLiteral` with zero expressions → `` `./foo.css` ``
 *
 * Uses `any` because OXC's AST mixes standard ESTree nodes with
 * OXC-specific variants (e.g. `StringLiteral`), and the project's
 * tsconfig enforces `noPropertyAccessFromIndexSignature`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStringValue(node: any): string | undefined {
  if (!node) return undefined;
  // Standard ESTree Literal (string value)
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  // OXC-specific StringLiteral node
  if (node.type === 'StringLiteral') {
    return node.value;
  }
  // Template literal with no interpolation (e.g., `./foo.css`)
  if (
    node.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTrueLiteral(node: any): boolean {
  if (!node) return false;

  if (node.type === 'BooleanLiteral') {
    return node.value === true;
  }

  if (node.type === 'Literal') {
    return node.value === true;
  }

  return false;
}

/**
 * Parses TypeScript/JS source with OXC and collects `styleUrl`, `styleUrls`,
 * and `templateUrl` property values from Angular `@Component()` decorators
 * in a single AST pass.
 *
 * This replaces the previous ts-morph implementation — OXC parses natively
 * via Rust NAPI bindings, avoiding the overhead of spinning up a full
 * TypeScript `Project` for each file.
 */
function collectComponentUrls(code: string): {
  styleUrls: string[];
  templateUrls: string[];
  inlineTemplates: string[];
} {
  const { program } = parseSync('cmp.ts', code);
  const styleUrls: string[] = [];
  const templateUrls: string[] = [];
  const inlineTemplates: string[] = [];

  const visitor = new Visitor({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ClassDeclaration(node: any) {
      const decorators = node.decorators ?? [];
      for (const decorator of decorators) {
        const expression = decorator.expression;
        if (
          expression?.type !== 'CallExpression' ||
          expression.callee?.type !== 'Identifier' ||
          expression.callee.name !== 'Component'
        ) {
          continue;
        }

        const componentArg = expression.arguments?.[0];
        if (componentArg?.type !== 'ObjectExpression') {
          continue;
        }

        for (const property of componentArg.properties ?? []) {
          if (
            property?.type !== 'Property' ||
            property.key?.type !== 'Identifier'
          ) {
            continue;
          }

          const name = property.key.name;

          if (
            name === 'styleUrls' &&
            property.value?.type === 'ArrayExpression'
          ) {
            for (const el of property.value.elements) {
              const val = getStringValue(el);
              if (val !== undefined) styleUrls.push(val);
            }
          }

          if (name === 'styleUrl') {
            const val = getStringValue(property.value);
            if (val !== undefined) styleUrls.push(val);
          }

          if (name === 'templateUrl') {
            const val = getStringValue(property.value);
            if (val !== undefined) templateUrls.push(val);
          }

          if (name === 'template') {
            const val = getStringValue(property.value);
            if (val !== undefined) inlineTemplates.push(val);
          }
        }
      }
    },
  });
  visitor.visit(program);

  return { styleUrls, templateUrls, inlineTemplates };
}

export interface AngularComponentMetadata {
  className: string;
  hasStandaloneTrue?: boolean;
  selector?: string;
  styleUrls: string[];
  templateUrls: string[];
  inlineTemplates: string[];
}

/**
 * Extract Angular component identities from raw source code before Angular's
 * compilation pipeline strips decorators. This is used for dev-time
 * diagnostics such as duplicate selectors, duplicate component class names,
 * selectorless shared components, and inline-template validation.
 */
export function getAngularComponentMetadata(
  code: string,
): AngularComponentMetadata[] {
  const { program } = parseSync('cmp.ts', code);
  const components: AngularComponentMetadata[] = [];

  const visitor = new Visitor({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ClassDeclaration(node: any) {
      const decorators = node.decorators ?? [];
      for (const decorator of decorators) {
        const expression = decorator.expression;
        if (
          expression?.type !== 'CallExpression' ||
          expression.callee?.type !== 'Identifier' ||
          expression.callee.name !== 'Component'
        ) {
          continue;
        }

        const componentArg = expression.arguments?.[0];
        if (componentArg?.type !== 'ObjectExpression') {
          continue;
        }

        const metadata: AngularComponentMetadata = {
          className: node.id?.name ?? '(anonymous)',
          styleUrls: [],
          templateUrls: [],
          inlineTemplates: [],
        };

        for (const property of componentArg.properties ?? []) {
          if (
            property?.type !== 'Property' ||
            property.key?.type !== 'Identifier'
          ) {
            continue;
          }

          const name = property.key.name;
          if (name === 'selector') {
            metadata.selector = getStringValue(property.value);
          } else if (name === 'standalone' && isTrueLiteral(property.value)) {
            metadata.hasStandaloneTrue = true;
          } else if (name === 'styleUrl') {
            const val = getStringValue(property.value);
            if (val !== undefined) {
              metadata.styleUrls.push(val);
            }
          } else if (
            name === 'styleUrls' &&
            property.value?.type === 'ArrayExpression'
          ) {
            for (const el of property.value.elements ?? []) {
              const val = getStringValue(el);
              if (val !== undefined) {
                metadata.styleUrls.push(val);
              }
            }
          } else if (name === 'templateUrl') {
            const val = getStringValue(property.value);
            if (val !== undefined) {
              metadata.templateUrls.push(val);
            }
          } else if (name === 'template') {
            const val = getStringValue(property.value);
            if (val !== undefined) {
              metadata.inlineTemplates.push(val);
            }
          }
        }

        components.push(metadata);
      }
    },
  });
  visitor.visit(program);

  return components;
}

/** Extract all `styleUrl` / `styleUrls` values from Angular component source. */
export function getStyleUrls(code: string): string[] {
  return collectComponentUrls(code).styleUrls;
}

/** Extract all `templateUrl` values from Angular component source. */
export function getTemplateUrls(code: string): string[] {
  return collectComponentUrls(code).templateUrls;
}

/** Extract inline `template` strings from Angular component source. */
export function getInlineTemplates(code: string): string[] {
  return collectComponentUrls(code).inlineTemplates;
}

// ---------------------------------------------------------------------------
// Resolver caches
// ---------------------------------------------------------------------------

interface StyleUrlsCacheEntry {
  matchedStyleUrls: string[];
  styleUrls: string[];
}

export class StyleUrlsResolver {
  // These resolvers may be called multiple times during the same
  // compilation for the same files. Caching is required because these
  // resolvers use synchronous system calls to the filesystem, which can
  // degrade performance when running compilations for multiple files.
  private readonly styleUrlsCache = new Map<string, StyleUrlsCacheEntry>();

  resolve(code: string, id: string): string[] {
    const matchedStyleUrls = getStyleUrls(code);
    const entry = this.styleUrlsCache.get(id);
    // We're using `matchedStyleUrls` as a key because the code may be changing continuously,
    // resulting in the resolver being called multiple times. While the code changes, the
    // `styleUrls` may remain constant, which means we should always return the previously
    // resolved style URLs.
    if (entry && entry.matchedStyleUrls === matchedStyleUrls) {
      return entry.styleUrls;
    }

    const styleUrls = matchedStyleUrls.map((styleUrlPath) => {
      return `${styleUrlPath}|${normalizePath(
        resolve(dirname(id), styleUrlPath),
      )}`;
    });

    this.styleUrlsCache.set(id, { styleUrls, matchedStyleUrls });
    return styleUrls;
  }
}

interface TemplateUrlsCacheEntry {
  code: string;
  templateUrlPaths: string[];
}

export class TemplateUrlsResolver {
  private readonly templateUrlsCache = new Map<
    string,
    TemplateUrlsCacheEntry
  >();

  resolve(code: string, id: string): string[] {
    const entry = this.templateUrlsCache.get(id);
    if (entry?.code === code) {
      return entry.templateUrlPaths;
    }

    const templateUrlPaths = getTemplateUrls(code).map(
      (url) => `${url}|${normalizePath(resolve(dirname(id), url))}`,
    );

    this.templateUrlsCache.set(id, { code, templateUrlPaths });
    return templateUrlPaths;
  }
}
