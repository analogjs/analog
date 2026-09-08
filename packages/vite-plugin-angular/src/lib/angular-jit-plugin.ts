import { Plugin, ResolvedConfig, preprocessCSS } from 'vite';
import {
  JIT_INLINE_STYLE_PREFIX,
  getJitInlineStyles,
} from './utils/jit-inline-styles.js';
import { discoverAnalogIntegrations } from './analog-plugin-interop.js';
import { createStylesheetTransform } from './stylesheet-pipeline.js';
import type { StylePreprocessor } from './style-preprocessor.js';

export function jitPlugin({
  inlineStylesExtension,
}: {
  inlineStylesExtension: string;
}): Plugin {
  let config: ResolvedConfig;
  let stylePreprocessor: StylePreprocessor | undefined;
  const renderStylesheet = createStylesheetTransform((code, file) =>
    preprocessCSS(code, file, config),
  );

  return {
    name: '@analogjs/vite-plugin-angular-jit',
    configResolved(_config) {
      config = _config;
    },
    async buildStart() {
      stylePreprocessor = (await discoverAnalogIntegrations(config))
        .stylePreprocessor;
    },
    resolveId(id: string) {
      if (id.startsWith('virtual:angular')) {
        return `\0${id}`;
      }

      return;
    },
    async load(id: string) {
      if (id.includes(JIT_INLINE_STYLE_PREFIX)) {
        const styleIdHash = id.slice(
          id.indexOf('style:inline;') + 'style:inline;'.length,
        );
        const encodedStyles = getJitInlineStyles(styleIdHash);

        if (encodedStyles === undefined) {
          return;
        }

        const decodedStyles = Buffer.from(
          decodeURIComponent(encodedStyles),
          'base64',
        ).toString();
        const styles = await renderStylesheet({
          data: decodedStyles,
          containingFile: `${styleIdHash}.ts`,
          resourceFile: undefined,
          className: undefined,
          order: undefined,
          inlineStylesExtension,
          registry: undefined,
          preprocessor: stylePreprocessor,
        });
        return `export default ${JSON.stringify(styles ?? '')}`;
      }

      return;
    },
  };
}
