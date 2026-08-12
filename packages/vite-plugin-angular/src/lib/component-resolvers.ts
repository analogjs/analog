import { dirname, resolve } from 'node:path';
import { parseSync } from 'oxc-parser';
import { normalizePath } from 'vite';

interface StyleUrlsCacheEntry {
  code: string;
  styleUrls: string[];
}

export class StyleUrlsResolver {
  // These resolvers may be called multiple times during the same
  // compilation for the same files. Caching is required because these
  // resolvers use synchronous system calls to the filesystem, which can
  // degrade performance when running compilations for multiple files.
  private readonly styleUrlsCache = new Map<string, StyleUrlsCacheEntry>();

  resolve(code: string, id: string): string[] {
    const entry = this.styleUrlsCache.get(id);
    if (entry?.code === code) {
      return entry.styleUrls;
    }

    const styleUrls = getStyleUrls(code).map((styleUrlPath) => {
      return `${styleUrlPath}|${normalizePath(
        resolve(dirname(id), styleUrlPath),
      )}`;
    });

    this.styleUrlsCache.set(id, { code, styleUrls });
    return styleUrls;
  }
}

interface ResourceUrls {
  templateUrls: string[];
  styleUrls: string[];
}

// Shared memo so template and style extraction for the same code reuse a
// single parse. `resolve()` is synchronous, so the last-parse memo cannot be
// interleaved by another file's code.
let lastParsedCode: string | undefined;
let lastParsedUrls: ResourceUrls = { templateUrls: [], styleUrls: [] };

function getResourceUrls(code: string): ResourceUrls {
  if (code === lastParsedCode) {
    return lastParsedUrls;
  }

  const urls: ResourceUrls = { templateUrls: [], styleUrls: [] };
  // A fixed TypeScript filename keeps decorator parsing independent of the
  // module id, which may carry Vite query suffixes.
  const { program } = parseSync('cmp.ts', code);
  visit(program, urls);

  lastParsedCode = code;
  lastParsedUrls = urls;
  return urls;
}

/** Value of a string literal or a template literal without interpolations. */
function getStringValue(node: any): string | undefined {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  if (node?.type === 'TemplateLiteral' && node.quasis?.length === 1) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }

  return undefined;
}

function collectFromObjectExpression(node: any, urls: ResourceUrls): void {
  for (const property of node.properties ?? []) {
    if (property.type !== 'Property') continue;

    const key = property.key?.name ?? property.key?.value;
    const value = property.value;

    if (key === 'templateUrl') {
      const url = getStringValue(value);
      if (url !== undefined) urls.templateUrls.push(url);
    } else if (key === 'styleUrl') {
      const url = getStringValue(value);
      if (url !== undefined) urls.styleUrls.push(url);
    } else if (key === 'styleUrls' && value?.type === 'ArrayExpression') {
      for (const element of value.elements) {
        const url = getStringValue(element);
        if (url !== undefined) urls.styleUrls.push(url);
      }
    }
  }
}

// Object literals holding these properties are not always decorator arguments
// on a top-level class, so every object expression in the file is inspected.
function visit(node: any, urls: ResourceUrls): void {
  // Array holes (`[a, , b]`) are `null` entries in the AST.
  if (!node) return;

  if (Array.isArray(node)) {
    for (const element of node) visit(element, urls);
    return;
  }

  if (node.type === 'ObjectExpression') {
    collectFromObjectExpression(node, urls);
  }

  for (const key in node) {
    const child = node[key];
    if (child && typeof child === 'object') visit(child, urls);
  }
}

export function getStyleUrls(code: string) {
  return getResourceUrls(code).styleUrls;
}

export function getTemplateUrls(code: string) {
  return getResourceUrls(code).templateUrls;
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
