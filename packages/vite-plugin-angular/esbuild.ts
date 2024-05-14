import analog from '@analogjs/vite-plugin-angular';
import type * as esbuild from 'esbuild';
import { PluginOptions } from './src';

export const analogSFC: (options?: PluginOptions) => esbuild.Plugin = (
  options
) => ({
  name: 'analog-sfc-esbuild-plugin',
  async setup(build) {
    const analogPlugins: any = analog({
      ...(options || {}),
      experimental: {
        supportAnalogFormat: true,
        ...(options?.experimental || {}),
      },
    });

    const analogPlugin = analogPlugins[0];
    await analogPlugin.config({ root: '.' }, { command: 'build' });
    await analogPlugin.buildStart?.({
      plugins: [
        {
          name: 'vite:css',
          transform(code: string) {
            return { code };
          },
        },
      ],
    });

    build.onLoad({ filter: /.analog$/ }, async (args) => {
      await analogPlugin.handleHotUpdate?.({ file: args.path, modules: [] });
      const result = await analogPlugin.transform?.('', args.path);
      return { loader: 'js', contents: result?.code };
    });
  },
});
