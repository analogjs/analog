import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { NitroConfig } from 'nitropack';
import { toNodeListener } from 'h3';
import { Plugin, ViteDevServer } from 'vite';

export function viteNitroPlugin(opts?: NitroConfig): Plugin {
  const rootDir = opts?.rootDir || 'src';
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];

  const nitroConfig: NitroConfig = {
    rootDir,
    srcDir: `${rootDir}/server`,
    scanDirs: [`${rootDir}/server`],
    output: {
      dir: '../../dist/server',
      ...opts?.output,
    },
    buildDir: '../dist/.nitro',
    typescript: {
      generateTsConfig: false,
    },
    ...opts,
  };

  let isBuild = false;
  let isServe = false;

  return {
    name: 'vite-nitro-plugin',
    config(_config, { command }) {
      isServe = command === 'serve';
      isBuild = command === 'build';
    },
    async configureServer(viteServer: ViteDevServer) {
      if (isServe && !isTest) {
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
      }
    },

    async closeBundle() {
      if (isBuild) {
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
      }
    },
  };
}
