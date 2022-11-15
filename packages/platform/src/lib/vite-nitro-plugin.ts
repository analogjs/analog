import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { NitroConfig } from 'nitropack';
import { toNodeListener } from 'h3';
import { Plugin, ViteDevServer } from 'vite';

export function viteNitroPlugin(opts?: NitroConfig): Plugin {
  const nitroConfig: NitroConfig = {
    rootDir: 'src',
    srcDir: 'src/server',
    scanDirs: ['src/server'],
    output: {
      dir: '../../dist/server',
      ...opts?.output,
    },
    buildDir: '../dist/.nitro',
    ...opts,
  };
  return {
    name: 'vite-nitro-plugin',

    async configureServer(viteServer: ViteDevServer) {
      const { createNitro, createDevServer, build, prepare } =
        await loadEsmModule<typeof import('nitropack')>('nitropack');

      const nitro = await createNitro({ ...nitroConfig, dev: true });
      const server = createDevServer(nitro);
      await prepare(nitro);
      await build(nitro);
      viteServer.middlewares.use('/api', toNodeListener(server.app));
      console.log(
        `\n\nThe '@analogjs/platform' successfully started.\nThe server endpoints are accessible under the "/api"`
      );
    },

    async closeBundle() {
      const { createNitro, build, prepare } = await loadEsmModule<
        typeof import('nitropack')
      >('nitropack');

      const nitro = await createNitro({
        ...nitroConfig,
        baseURL: '/api',
        dev: false,
      });
      await prepare(nitro);
      await build(nitro);
      await nitro.close();
      console.log(
        `\n\nThe '@analogjs/platform' server has been successfully built.`
      );
    },
  };
}
