import { build, mergeConfig, UserConfig } from 'vite';
import { relative, resolve } from 'node:path';

import { Options } from './options.js';
import { getBundleOptionsKey } from './utils/rolldown.js';

export async function buildClientApp(
  config: UserConfig,
  options?: Options,
): Promise<void> {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const rootDir = relative(workspaceRoot, config.root || '.') || '.';
  const clientBuildConfig = mergeConfig(config, <UserConfig>{
    build: {
      ssr: false,
      outDir:
        config.build?.outDir ||
        resolve(workspaceRoot, 'dist', rootDir, 'client'),
      emptyOutDir: true,
    },
  });

  await build(clientBuildConfig);
}

export async function buildSSRApp(
  config: UserConfig,
  options?: Options,
): Promise<void> {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const sourceRoot = options?.sourceRoot ?? 'src';
  const rootDir = relative(workspaceRoot, config.root || '.') || '.';
  const bundleOptionsKey = getBundleOptionsKey();

  /**
   * SSR is built as a second pass from the already prepared Analog/Vite config.
   *
   * That means we intentionally start from the same base config used for the
   * client build and then merge only the SSR-specific overrides (entry, outDir,
   * `build.ssr`, etc).
   *
   * A side effect of this design is that the resolved SSR config can expose the
   * same high-level Analog plugin chain more than once when Vite/Nitro replays
   * shared plugins for the server environment. In particular,
   * `@analogjs/vite-plugin-angular` may appear twice in `config.plugins` during
   * SSR resolution:
   * - once from the normal Analog platform plugin expansion
   * - once from the reused/shared plugin graph for the SSR pass
   *
   * That does NOT imply the client build has two competing style registries.
   * The client-side duplicate-registration guard in `vite-plugin-angular`
   * therefore explicitly ignores `build.ssr === true` to avoid treating this
   * valid SSR orchestration detail as a style-map bug.
   */
  const ssrBuildConfig = mergeConfig(config, <UserConfig>{
    build: {
      ssr: true,
      [bundleOptionsKey]: {
        input:
          options?.entryServer ||
          resolve(workspaceRoot, rootDir, `${sourceRoot}/main.server.ts`),
      },
      outDir:
        options?.ssrBuildDir || resolve(workspaceRoot, 'dist', rootDir, 'ssr'),
      // Preserve the client build output. The client pass already handled its
      // own cleanup, and on Windows this nested SSR build can otherwise remove
      // sibling artifacts that Nitro needs to read immediately afterward.
      emptyOutDir: false,
    },
  });

  await build(ssrBuildConfig);
}
