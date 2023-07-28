import { dirname, resolve } from 'path';

const styleUrlsRE = /styleUrls\s*:\s*\[([^\[]*?)\]/;
const templateUrlRE = /templateUrl:\s*["'](.*?)["']/g;

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
      // The above replace will result in the following:
      // "./app.component.scss,../global.scss"
      .split(',');

    const styleUrls = styleUrlPaths.map((styleUrlPath) => {
      return `${styleUrlPath}|${resolve(dirname(id), styleUrlPath)}`;
    });

    this.styleUrlsCache.set(matchedStyleUrls, { styleUrls, matchedStyleUrls });
    return styleUrls;
  }
}

export function hasTemplateUrl(code: string) {
  return code.includes('templateUrl:');
}

interface TemplateUrlsCacheEntry {
  matchedTemplateUrls: string;
  templateUrls: string[];
}

export class TemplateUrlsResolver {
  private readonly templateUrlsCache = new Map<
    string,
    TemplateUrlsCacheEntry
  >();

  resolve(code: string, id: string): string[] {
    const templateUrlMatchArrays = Array.from(code.matchAll(templateUrlRE));

    if (templateUrlMatchArrays.length === 0) {
      return EMPTY_ARRAY;
    }

    // The `matchedTemplateUrls` would result in the following:
    // `templateUrl: "./app.component.html",./app.component.html|templateUrl: "./app1.component.html",./app1.component.html`.
    const matchedTemplateUrls = templateUrlMatchArrays.join('|');
    const entry = this.templateUrlsCache.get(id);
    if (entry?.matchedTemplateUrls === matchedTemplateUrls) {
      return entry.templateUrls;
    }

    const templateUrls: string[] = [];
    templateUrlMatchArrays.forEach((matchArray) => {
      const resolvedTemplatePath = matchArray[1].replace(
        /templateUrl|\s|'|"|\:|,/g,
        ''
      );

      const templateUrl = resolve(dirname(id), resolvedTemplatePath);
      templateUrls.push(`${resolvedTemplatePath}|${templateUrl}`);
    });

    this.templateUrlsCache.set(id, { matchedTemplateUrls, templateUrls });
    return templateUrls;
  }
}
