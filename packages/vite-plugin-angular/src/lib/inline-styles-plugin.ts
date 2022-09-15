import { Plugin } from 'vite';

const virtualModuleId = 'virtual:analog-inline-styles-module';

/**
 * This plugin decodes and returns inline styles that were
 * extracted from the Component decorator metadata and encoded
 * into the import string. This allows Vite to intercept
 * these imports, convert them into virtual modules, and
 * return them as imported styles to pass through the CSS
 * transform pipeline.
 */
export function inlineStylesPlugin(inlineStylesExtension = ''): Plugin {
  return {
    name: '@analogjs/vite-plugin-angular-inline-styles',
    enforce: 'pre',
    resolveId(id) {
      if (id.includes(`.${inlineStylesExtension}?ngResource`)) {
        return '\0' + virtualModuleId + id;
      }

      return undefined;
    },
    async load(id) {
      if (!id.startsWith(`\0${virtualModuleId}`)) {
        return undefined;
      }

      const encodedStyles = id.match(/data=(.*)\!/)![1];
      const styles = Buffer.from(
        decodeURIComponent(encodedStyles),
        'base64'
      ).toString();

      return {
        code: styles,
      };
    },
  };
}
