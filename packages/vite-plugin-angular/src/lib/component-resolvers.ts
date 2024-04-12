import { dirname, resolve } from 'node:path';
import {
  ArrayLiteralExpression,
  Project,
  PropertyAssignment,
  SyntaxKind,
} from 'ts-morph';
import { normalizePath } from 'vite';

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
    // Given the code is the following:
    // @Component({
    //   styleUrls: [
    //     './app.component.scss'
    //   ]
    // })
    // The `matchedStyleUrls` would result in: `styleUrls: [\n    './app.component.scss'\n  ]`.
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
        resolve(dirname(id), styleUrlPath)
      )}`;
    });

    this.styleUrlsCache.set(id, { styleUrls, matchedStyleUrls });
    return styleUrls;
  }
}

function getTextByProperty(name: string, properties: PropertyAssignment[]) {
  return properties
    .filter((property) => property.getName() === name)
    .map((property) =>
      property.getInitializer()?.getText().replace(/['"`]/g, '')
    )
    .filter((url): url is string => url !== undefined);
}

export function getStyleUrls(code: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile('cmp.ts', code);
  const properties = sourceFile.getDescendantsOfKind(
    SyntaxKind.PropertyAssignment
  );
  const styleUrl = getTextByProperty('styleUrl', properties);
  const styleUrls = properties
    .filter((property) => property.getName() === 'styleUrls')
    .map((property) => property.getInitializer() as ArrayLiteralExpression)
    .flatMap((array) =>
      array.getElements().map((el) => el.getText().replace(/['"`]/g, ''))
    );

  return [...styleUrls, ...styleUrl];
}

export function getTemplateUrls(code: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile('cmp.ts', code);
  const properties = sourceFile.getDescendantsOfKind(
    SyntaxKind.PropertyAssignment
  );
  return getTextByProperty('templateUrl', properties);
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
      (url) =>
        `${url}|${normalizePath(resolve(dirname(id), url).replace(/\\/g, '/'))}`
    );

    this.templateUrlsCache.set(id, { code, templateUrlPaths });
    return templateUrlPaths;
  }
}
