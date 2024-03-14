import { Plugin, PluginContainer, ViteDevServer } from 'vite';

export function jitPlugin({
  inlineStylesExtension,
}: {
  inlineStylesExtension: string;
}): Plugin {
  let styleTransform: PluginContainer['transform'] | undefined;
  let watchMode = false;
  let viteServer: ViteDevServer | undefined;
  let cssPlugin: Plugin | undefined;

  return {
    name: '@analogjs/vite-plugin-angular-jit',
    config(_config, { command }) {
      watchMode = command === 'serve';
    },
    buildStart({ plugins }) {
      if (Array.isArray(plugins)) {
        cssPlugin = plugins.find((plugin) => plugin.name === 'vite:css');
      }

      styleTransform = watchMode
        ? viteServer!.pluginContainer.transform
        : (cssPlugin!.transform as PluginContainer['transform']);
    },
    configureServer(server) {
      viteServer = server;
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
          const compiled = await styleTransform!(
            decodedStyles,
            `${styleId}.${inlineStylesExtension}?direct`
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
