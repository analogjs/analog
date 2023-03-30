import { build, mergeConfig, UserConfig } from 'vite';
import { Options } from '../options';

export async function buildSSRApp(config: UserConfig, options?: Options) {
  const ssrBuildConfig = mergeConfig(config, {
    build: {
      ssr: true,
      rollupOptions: {
        input: options?.entryServer || './src/main.server.ts',
      },
      outDir: options?.ssrBuildDir || './dist/ssr',
    },
  });

  await build(ssrBuildConfig);
}
