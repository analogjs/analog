import { Plugin, ResolvedConfig, preprocessCSS } from 'vite';
import {
  JIT_INLINE_STYLE_PREFIX,
  getJitInlineStyles,
} from './utils/jit-inline-styles.js';
import { debugStyles } from './utils/debug.js';
import { isTailwindReferenceError } from './utils/tailwind-reference.js';

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
          if (isTailwindReferenceError(e)) {
            throw e;
          }
          const errorMessage = e instanceof Error ? e.message : String(e);
          debugStyles('jit css compilation error', {
            styleIdHash,
            error: errorMessage,
          });
          console.warn(
            '[@analogjs/vite-plugin-angular]: Failed to preprocess inline JIT stylesheet %s. Returning an empty stylesheet instead. %s',
            styleIdHash,
            errorMessage,
          );
        }

        return `export default \`${styles}\``;
      }

      return;
    },
  };
}
