import { dirname, resolve } from 'node:path';
import {
  ArrayLiteralExpression,
  Project,
  PropertyAssignment,
  SyntaxKind,
} from 'ts-morph';
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

// Shared project so template and style extraction for the same code reuse a
// single parse. `resolve()` is synchronous, so the last-parse memo cannot be
// interleaved by another file's code.
const project = new Project({ useInMemoryFileSystem: true });
let lastParsedCode: string | undefined;
let lastParsedProperties: PropertyAssignment[] = [];

function getPropertyAssignments(code: string): PropertyAssignment[] {
  if (code === lastParsedCode) {
    return lastParsedProperties;
  }

  const sourceFile = project.createSourceFile('cmp.ts', code, {
    overwrite: true,
  });
  lastParsedCode = code;
  lastParsedProperties = sourceFile.getDescendantsOfKind(
    SyntaxKind.PropertyAssignment,
  );
  return lastParsedProperties;
}

function getTextByProperty(name: string, properties: PropertyAssignment[]) {
  return properties
    .filter((property) => property.getName() === name)
    .map((property) =>
      property.getInitializer()?.getText().replace(/['"`]/g, ''),
    )
    .filter((url): url is string => url !== undefined);
}

export function getStyleUrls(code: string) {
  const properties = getPropertyAssignments(code);
  const styleUrl = getTextByProperty('styleUrl', properties);
  const styleUrls = properties
    .filter((property) => property.getName() === 'styleUrls')
    .map((property) => property.getInitializer() as ArrayLiteralExpression)
    .flatMap((array) =>
      array.getElements().map((el) => el.getText().replace(/['"`]/g, '')),
    );

  return [...styleUrls, ...styleUrl];
}

export function getTemplateUrls(code: string) {
  return getTextByProperty('templateUrl', getPropertyAssignments(code));
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
