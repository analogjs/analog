import { dirname, resolve } from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { normalizePath } from 'vite';

const styleUrlsRE = /styleUrls\s*:\s*\[([^\[]*?)\]|styleUrl:\s*["'](.*?)["']/;

export function hasStyleUrls(code: string) {
  return styleUrlsRE.test(code);
}

interface StyleUrlsCacheEntry {
  matchedStyleUrls: string;
  styleUrls: string[];
}

const EMPTY_ARRAY: any[] = [];

export class StyleUrlsResolver {
  // These resolvers may be called multiple times during the same
  // compilation for the same files. Caching is required because these
  // resolvers use synchronous system calls to the filesystem, which can
  // degrade performance when running compilations for multiple files.
  private readonly styleUrlsCache = new Map<string, StyleUrlsCacheEntry>();

  resolve(code: string, id: string): string[] {
    const styleUrlsExecArray = styleUrlsRE.exec(code);

    if (styleUrlsExecArray === null) {
      return EMPTY_ARRAY;
    }

    // Given the code is the following:
    // @Component({
    //   styleUrls: [
    //     './app.component.scss'
    //   ]
    // })
    // The `matchedStyleUrls` would result in: `styleUrls: [\n    './app.component.scss'\n  ]`.
    const [matchedStyleUrls] = styleUrlsExecArray;
    const entry = this.styleUrlsCache.get(id);
    // We're using `matchedStyleUrls` as a key because the code may be changing continuously,
    // resulting in the resolver being called multiple times. While the code changes, the
    // `styleUrls` may remain constant, which means we should always return the previously
    // resolved style URLs.
    if (entry?.matchedStyleUrls === matchedStyleUrls) {
      return entry.styleUrls;
    }

    // The `styleUrls` property is an array, which means we may have a list of
    // CSS files provided there. Let `matchedStyleUrls` be equal to the following:
    // "styleUrls: [\n    './app.component.scss',\n    '../global.scss'\n  ]"
    const styleUrlPaths = matchedStyleUrls
      .replace(/(styleUrls|\:|\s|\[|\]|"|')/g, '')
      .replace(/(styleUrl|:\s*["'](.*?)["'])/g, '')
      // The above replace will result in the following:
      // "./app.component.scss,../global.scss"
      .split(',');

    const styleUrls = styleUrlPaths.map((styleUrlPath) => {
      return `${styleUrlPath}|${normalizePath(
        resolve(dirname(id), styleUrlPath)
      )}`;
    });

    this.styleUrlsCache.set(matchedStyleUrls, { styleUrls, matchedStyleUrls });
    return styleUrls;
  }
}

export function hasTemplateUrl(code: string) {
  return code.includes('templateUrl:');
}

export function getTemplateUrls(code: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile('cmp.ts', code);
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .filter((property) => property.getName() === 'templateUrl')
    .map((property) =>
      property.getInitializer()?.getText().replace(/['"]/g, '')
    )
    .filter((url): url is string => url !== undefined);
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
