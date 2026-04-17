import type { NitroConfig } from 'nitro/types';
import {
  build,
  copyPublicAssets,
  createNitro,
  prepare,
  prerender,
} from 'nitro/builder';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Options } from './options.js';
import { addPostRenderingHooks } from './hooks/post-rendering-hook.js';

export function isVercelPreset(preset: string | undefined): boolean {
  return !!preset?.toLowerCase().includes('vercel');
}

export async function buildServer(
  options?: Options,
  nitroConfig?: NitroConfig,
  routeSourceFiles?: Record<string, string>,
): Promise<void> {
  // ── Force Rollup as the server bundler ────────────────────────────
  //
  // Nitro v3 defaults to Rolldown when available. Rolldown is faster,
  // but its module resolver cannot resolve relative chunk imports
  // (e.g. `./assets/core-DTazUigR.js`) from a rebundled SSR entry on
  // Windows. The prerender build fails with:
  //
  //   [RESOLVE_ERROR] Could not resolve './assets/core-DTazUigR.js'
  //     in ../../dist/apps/blog-app/ssr/main.server.js
  //
  // This is a known Rolldown limitation with cross-directory relative
  // paths on Windows (backslash vs forward-slash normalisation).
  // Rollup handles these paths correctly on all platforms.
  //
  // The dev server already uses `builder: 'rollup'` for the same
  // reason. Default to Rollup here too until Rolldown's resolver
  // matures. The caller can still opt in to Rolldown explicitly via
  // nitroConfig.builder if their platform supports it.
  const nitro = await createNitro({
    dev: false,
    preset: process.env['BUILD_PRESET'],
    ...nitroConfig,
    builder: nitroConfig?.builder ?? 'rollup',
  });

  if (options?.prerender?.postRenderingHooks) {
    addPostRenderingHooks(nitro, options.prerender.postRenderingHooks);
  }

  await prepare(nitro);
  await copyPublicAssets(nitro);

  if (
    options?.ssr &&
    nitroConfig?.prerender?.routes &&
    (nitroConfig?.prerender?.routes.find((route) => route === '/') ||
      nitroConfig?.prerender?.routes?.length === 0)
  ) {
    const indexFileExts = ['', '.br', '.gz'];

    indexFileExts.forEach((fileExt) => {
      // Remove the root index.html(.br|.gz) files
      const indexFilePath = join(
        nitroConfig?.output?.publicDir ?? '',
        `index.html${fileExt}`,
      );

      rmSync(indexFilePath, { force: true });
    });
  }

  if (
    nitroConfig?.prerender?.routes &&
    nitroConfig?.prerender?.routes?.length > 0
  ) {
    console.log(`Prerendering static pages...`);
    await prerender(nitro);
  }

  if (routeSourceFiles && Object.keys(routeSourceFiles).length > 0) {
    const publicDir = nitroConfig?.output?.publicDir;
    if (!publicDir) {
      throw new Error(
        'Nitro public output directory is required to write route source files.',
      );
    }

    for (const [route, content] of Object.entries(routeSourceFiles)) {
      const outputPath = join(publicDir, `${route}.md`);
      const outputDir = dirname(outputPath);
      mkdirSync(outputDir, { recursive: true });

      writeFileSync(outputPath, content, 'utf8');
    }
  }

  if (!options?.static) {
    console.log('Building Server...');
    await build(nitro);
  }

  await nitro.close();
}
