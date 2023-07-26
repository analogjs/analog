import { dirname, resolve } from 'path';

const styleUrlsRE = /styleUrls\s*:\s*\[([^\[]*?)\]/;
const templateUrlRE = /templateUrl:\s*["'](.*?)["']/g;

export function hasStyleUrls(code: string) {
  return styleUrlsRE.test(code);
}

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

    const styleUrlsGroup = styleUrlsRE.exec(code);

    if (Array.isArray(styleUrlsGroup) && styleUrlsGroup[0]) {
      const styleUrls = styleUrlsGroup[0].replace(
        /(styleUrls|\:|\s|\[|\]|"|')/g,
        ''
      );
      const styleUrlPaths = styleUrls?.split(',') || [];

      const newEntry = {
        code,
        styleUrls: styleUrlPaths.map((styleUrlPath) => {
          return `${styleUrlPath}|${resolve(dirname(id), styleUrlPath)}`;
        }),
      };

      this.styleUrlsCache.set(id, newEntry);
      return newEntry.styleUrls;
    }

    return [];
  }
}

export function hasTemplateUrl(code: string) {
  return code.includes('templateUrl:');
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

    const templateUrlGroup = Array.from(code.matchAll(templateUrlRE));
    const templateUrlPaths: string[] = [];

    if (Array.isArray(templateUrlGroup)) {
      templateUrlGroup.forEach((trg) => {
        const resolvedTemplatePath = trg[1].replace(
          /templateUrl|\s|'|"|\:|,/g,
          ''
        );
        const templateUrlPath = resolve(dirname(id), resolvedTemplatePath);
        templateUrlPaths.push(`${resolvedTemplatePath}|${templateUrlPath}`);
      });
    }

    this.templateUrlsCache.set(id, { code, templateUrlPaths });
    return templateUrlPaths;
  }
}
