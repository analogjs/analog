import { Plugin, ResolvedConfig, preprocessCSS } from 'vite';
import {
  isAngularBuildContext,
  type AngularBuildContext,
} from './angular-build-context.js';
import { discoverAnalogIntegrations } from './analog-plugin-interop.js';
import type { StylePreprocessor } from './style-preprocessor.js';
import { preprocessStylesheet } from './stylesheet-registry.js';
import { releaseCssPreprocessorWorkers } from './utils/css-preprocessor-workers.js';
import { debugStyles } from './utils/debug.js';
import {
  JIT_INLINE_STYLE_PREFIX,
  getJitInlineStyles,
  hashJitInlineStyles,
} from './utils/jit-inline-styles.js';

export interface JitPluginOptions {
  inlineStylesExtension?: string;
}

export function jitPlugin(
  ctxOrOptions?: AngularBuildContext | JitPluginOptions,
): Plugin {
  const sharedCtx = isAngularBuildContext(ctxOrOptions)
    ? ctxOrOptions
    : undefined;
  const inlineStylesExtension = isAngularBuildContext(ctxOrOptions)
    ? ctxOrOptions.options.inlineStylesExtension
    : (ctxOrOptions?.inlineStylesExtension ?? 'css');

  let config: ResolvedConfig;
  let stylePreprocessor: StylePreprocessor | undefined;

  return {
    name: '@analogjs/vite-plugin-angular-jit',
    configResolved(_config) {
      config = _config;
      sharedCtx?.setResolvedConfig(_config);
    },
    async buildStart() {
      if (sharedCtx) {
        await sharedCtx.refreshIntegrations(config);
        stylePreprocessor = sharedCtx.stylePreprocessor;
      } else {
        stylePreprocessor = (await discoverAnalogIntegrations(config))
          .stylePreprocessor;
      }
    },
    resolveId(id: string) {
      if (id.startsWith('virtual:angular')) {
        return `\0${id}`;
      }

      return;
    },
    async load(id: string) {
      if (id.includes(JIT_INLINE_STYLE_PREFIX)) {
        const encodedStyles = getJitInlineStyles(id.split('style:inline;')[1]);
        const styleIdHash = hashJitInlineStyles(encodedStyles);
        const decodedStyles = Buffer.from(
          decodeURIComponent(encodedStyles),
          'base64',
        ).toString();
        const filename = `${styleIdHash}.${inlineStylesExtension}`;
        const activePreprocessor =
          stylePreprocessor ?? sharedCtx?.stylePreprocessor;
        const preprocessed = preprocessStylesheet(
          decodedStyles,
          filename,
          activePreprocessor,
          { filename, inline: true },
        );

        let styles: string | undefined = '';

        try {
          const compiled = await preprocessCSS(
            preprocessed,
            `${filename}?direct`,
            config ?? sharedCtx?.resolvedConfig!,
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
    closeBundle() {
      if (!this.meta?.watchMode) {
        releaseCssPreprocessorWorkers();
      }
    },
  };
}
