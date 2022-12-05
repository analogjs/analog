import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { NitroConfig } from 'nitropack';
import { toNodeListener } from 'h3';
import { Plugin, ViteDevServer } from 'vite';
import { Options } from './options';

export function viteNitroPlugin(
  options?: Options,
  nitroOptions?: NitroConfig
): Plugin {
  const rootDir = nitroOptions?.rootDir || 'src';
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];

  let nitroConfig: NitroConfig = {
    rootDir,
    logLevel: 0,
    srcDir: `${rootDir}/server`,
    scanDirs: [`${rootDir}/server`],
    output: {
      dir: '../../dist/server',
      ...nitroOptions?.output,
    },
    buildDir: '../dist/.nitro',
    typescript: {
      generateTsConfig: false,
    },
  };

  if (options?.ssr) {
    nitroConfig = {
      ...nitroConfig,
      publicAssets: [{ dir: `../../dist/client` }],
      serverAssets: [{ baseName: 'public', dir: `./dist/client` }],
      externals: {
        inline: ['zone.js/node'],
        external: ['rxjs', 'node-fetch-native/dist/polyfill', 'destr'],
      },
      moduleSideEffects: ['zone.js/bundles/zone-node.umd.js'],
      renderer: '~~/../renderer',
      handlers: [{ handler: '~~/../api-middleware', middleware: true }],
    };
  }

  nitroConfig = {
    ...nitroConfig,
    ...nitroOptions,
  };

  let isBuild = false;
  let isServe = false;
  let ssrBuild = false;

  return {
    name: 'analogjs-vite-nitro-plugin',
    config(_config, { command }) {
      isServe = command === 'serve';
      isBuild = command === 'build';
      ssrBuild = !!_config.build?.ssr;
    },
    async configureServer(viteServer: ViteDevServer) {
      if (isServe && !isTest) {
        const { createNitro, createDevServer, build, prepare } =
          await loadEsmModule<typeof import('nitropack')>('nitropack');

        const nitro = await createNitro({
          dev: true,
          ...nitroConfig,
        });
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
      if (isBuild && !ssrBuild) {
        const { createNitro, build, prepare, copyPublicAssets, prerender } =
          await loadEsmModule<typeof import('nitropack')>('nitropack');

        const nitro = await createNitro({
          dev: false,
          ...nitroConfig,
        });
        await prepare(nitro);
        await copyPublicAssets(nitro);
        await prerender(nitro);

        if (!options?.prerender) {
          await build(nitro);
        }

        await nitro.close();
        console.log(
          `\n\nThe '@analogjs/platform' server has been successfully built.`
        );
      }
    },
  };
}
