import { Plugin } from 'vite';

const virtualModuleId = 'virtual:analog-components-assets-module';

/**
 * This plugin decodes and returns component assets that were
 * extracted from the Component decorator metadata and encoded
 * into the import string. This allows Vite to intercept
 * these imports, convert them into virtual modules, and
 * return them as imported assets to pass through the appropriate
 * transform pipeline.
 */
export function componentAssetsPlugin(inlineStylesExtension = ''): Plugin {
  return {
    name: '@analogjs/vite-plugin-angular-component-assets',
    enforce: 'pre',
    resolveId(id) {
      if (id.includes('html?ngResource') && !id.includes(virtualModuleId)) {
        return '\0' + virtualModuleId + id;
      }

      if (
        id.includes(`.${inlineStylesExtension}?ngResource`) &&
        /data=(.*)\!/.test(id)
      ) {
        return '\0' + virtualModuleId + id;
      }

      return undefined;
    },
    async load(id) {
      if (!id.startsWith(`\0${virtualModuleId}`)) {
        return undefined;
      }

      if (id.includes(`.html`)) {
        return `export default "${id
          .replace('\x00', '')
          .replace(virtualModuleId, '')}"`;
      }

      if (
        id.includes(`.${inlineStylesExtension}?ngResource`) &&
        /data=(.*)\!/.test(id)
      ) {
        const encodedStyles = id.match(/data=(.*)\!/)![1];
        const styles = Buffer.from(
          decodeURIComponent(encodedStyles),
          'base64'
        ).toString();

        return {
          code: styles,
        };
      }

      return;
    },
  };
}
