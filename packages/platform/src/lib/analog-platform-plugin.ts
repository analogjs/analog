import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { NitroConfig } from 'nitropack';
import { Plugin, ViteDevServer } from 'vite';

export function analogPlatform(opts: NitroConfig): Plugin {
  const nitroConfig: NitroConfig = {
    rootDir: 'src',
    srcDir: 'src/server',
    scanDirs: ['src/server'],
    output: {
      dir: '../dist/server',
      ...opts.output,
    },
  };
  return {
    name: 'vite-nitro-plugin',

    async configureServer(viteServer: ViteDevServer) {
      const { createNitro, createDevServer, build } = await loadEsmModule<
        typeof import('nitropack')
      >('nitropack');

      const nitro = await createNitro({ ...nitroConfig, dev: true });
      const server = createDevServer(nitro);
      await build(nitro);
      viteServer.middlewares.use('/api', await server.app);
      console.log(
        `\n\nThe '@analogjs/platform' successfully started.\nThe server endpoints are accessible under the "/api"`
      );
    },

    async closeBundle() {
      const { createNitro, build } = await loadEsmModule<
        typeof import('nitropack')
      >('nitropack');

      const nitro = await createNitro({ ...nitroConfig, dev: false });
      await build(nitro);
      await nitro.close();
      console.log(`\n\nThe '@analogjs/platform' successfully built.`);
    },
  };
}
