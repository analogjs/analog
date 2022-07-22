import { dirname, resolve } from 'path';

const styleUrlsRE = /styleUrls\s*:\s*\[([^\[]*?)\]/;
const templateUrlRE = /\s*templateUrl\s*:\s*["|']*?["|'].*/;

export function hasStyleUrls(code: string) {
  return styleUrlsRE.test(code);
}

export function resolveStyleUrls(code: string, id: string) {
  const styleUrlsGroup = styleUrlsRE.exec(code);

  if (Array.isArray(styleUrlsGroup) && styleUrlsGroup[0]) {
    const styleUrls = styleUrlsGroup[0].replace(/(styleUrls|\:|\s|\[|\]|"|')/g, '');
    const styleUrlPaths = styleUrls?.split(',') || [];

    return styleUrlPaths.map(styleUrlPath => resolve(dirname(id), styleUrlPath));
  }

  return [];
}

export function hasTemplateUrl(code: string) {
  return templateUrlRE.test(code);
}

export function resolveTemplateUrl(code: string, id: string) {
  const templateUrlGroup = templateUrlRE.exec(code);

  let templateUrlPath = '';
  if (Array.isArray(templateUrlGroup) && templateUrlGroup[0]) {
    const resolvedTemplatePath = templateUrlGroup![0].replace(/templateUrl|\s|'|"|\:|,/g, '');
    templateUrlPath = resolve(dirname(id), resolvedTemplatePath);
  }

  return templateUrlPath;
}