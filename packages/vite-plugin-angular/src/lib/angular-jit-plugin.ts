import { Plugin, ResolvedConfig, preprocessCSS } from 'vite';
import {
  JIT_INLINE_STYLE_PREFIX,
  getJitInlineStyles,
} from './utils/jit-inline-styles.js';

export function jitPlugin({
  inlineStylesExtension,
}: {
  inlineStylesExtension: string;
}): Plugin {
  let config: ResolvedConfig;

  return {
    name: '@analogjs/vite-plugin-angular-jit',
    configResolved(_config) {
      config = _config;
    },
    resolveId(id: string) {
      if (id.startsWith('virtual:angular')) {
        return `\0${id}`;
      }

      return;
    },
    async load(id: string) {
      if (id.includes(JIT_INLINE_STYLE_PREFIX)) {
        const styleIdHash = id.split('style:inline;')[1];
        const encodedStyles = getJitInlineStyles(styleIdHash);

        if (encodedStyles === undefined) {
          return;
        }

        const decodedStyles = Buffer.from(
          decodeURIComponent(encodedStyles),
          'base64',
        ).toString();

        let styles: string | undefined = '';

        try {
          const compiled = await preprocessCSS(
            decodedStyles,
            `${styleIdHash}.${inlineStylesExtension}?direct`,
            config,
          );
          styles = compiled?.code;
        } catch (e) {
          console.error(`${e}`);
        }

        return `export default \`${styles}\``;
      }

      return;
    },
  };
}
