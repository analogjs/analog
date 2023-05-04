import { dirname, resolve } from 'path';

const styleUrlsRE = /styleUrls\s*:\s*\[([^\[]*?)\]/;
const templateUrlRE = /templateUrl:\s*["'](.*?)["']/g;

export function hasStyleUrls(code: string) {
  return styleUrlsRE.test(code);
}

export function resolveStyleUrls(code: string, id: string) {
  const styleUrlsGroup = styleUrlsRE.exec(code);

  if (Array.isArray(styleUrlsGroup) && styleUrlsGroup[0]) {
    const styleUrls = styleUrlsGroup[0].replace(
      /(styleUrls|\:|\s|\[|\]|"|')/g,
      ''
    );
    const styleUrlPaths = styleUrls?.split(',') || [];

    return styleUrlPaths.map((styleUrlPath) => {
      return `${styleUrlPath}|${resolve(dirname(id), styleUrlPath)}`;
    });
  }

  return [];
}

export function hasTemplateUrl(code: string) {
  return code.includes('templateUrl:');
}

export function resolveTemplateUrls(code: string, id: string) {
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

  return templateUrlPaths;
}
