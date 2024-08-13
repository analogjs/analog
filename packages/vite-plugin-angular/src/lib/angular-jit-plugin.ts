import { Plugin, ResolvedConfig, preprocessCSS } from 'vite';

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

        const decodedStyles = Buffer.from(
          decodeURIComponent(styleId),
          'base64'
        ).toString();

        let styles: string | undefined = '';

        try {
          const compiled = await preprocessCSS(
            decodedStyles,
            `${styleId}.${inlineStylesExtension}?direct`,
            config
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
