import { Plugin, PluginContainer } from 'vite';
import { readFileSync } from 'fs';

export function jitPlugin({
  styleTransform,
  inlineStylesExtension,
}: {
  styleTransform: PluginContainer['transform'];
  inlineStylesExtension: string;
}): Plugin {
  return {
    name: '@analogjs/vite-plugin-angular-jit',
    resolveId(id: string) {
      if (id.startsWith('virtual:angular')) {
        return `\0${id}`;
      }

      return;
    },
    async load(id: string) {
      if (id.includes('virtual:angular:jit:template:file;')) {
        const contents = readFileSync(id.split('file;')[1], 'utf-8');

        return `export default \`${contents}\`;`;
      } else if (id.includes('virtual:angular:jit:style:inline;')) {
        const styleId = id.split('style:inline;')[1];

        const decodedStyles = Buffer.from(
          decodeURIComponent(styleId),
          'base64'
        ).toString();

        let styles: string | undefined = '';

        try {
          const compiled = await styleTransform(
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
