import { createHash } from 'node:crypto';
import { Plugin, ResolvedConfig, preprocessCSS } from 'vite';
import { debugStyles } from './utils/debug.js';

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
      if (id.includes('virtual:angular:jit:style:inline;')) {
        const styleId = id.split('style:inline;')[1];
        // styleId may exceed 255 bytes of base64-encoded content, limit to 16
        const styleIdHash = createHash('sha256')
          .update(styleId)
          .digest('hex')
          .slice(0, 16);

        const decodedStyles = Buffer.from(
          decodeURIComponent(styleId),
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
