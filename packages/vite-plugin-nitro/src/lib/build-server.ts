import type { NitroConfig } from 'nitro/types';
import {
  build,
  copyPublicAssets,
  createNitro,
  prepare,
  prerender,
} from 'nitro/builder';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Options } from './options.js';
import { addPostRenderingHooks } from './hooks/post-rendering-hook.js';

function isVercelPreset(preset: string | undefined) {
  return !!preset?.toLowerCase().includes('vercel');
}

function ensureVercelFunctionConfig(
  nitro: Awaited<ReturnType<typeof createNitro>>,
) {
  if (!isVercelPreset(nitro.options.preset)) {
    return;
  }

  const serverDir = nitro.options.output.serverDir;
  const functionConfigPath = join(serverDir, '.vc-config.json');

  if (existsSync(functionConfigPath)) {
    return;
  }

  mkdirSync(serverDir, { recursive: true });

  writeFileSync(
    functionConfigPath,
    JSON.stringify(
      {
        handler: 'index.mjs',
        launcherType: 'Nodejs',
        shouldAddHelpers: false,
        supportsResponseStreaming: true,
        ...nitro.options.vercel?.functions,
      },
      null,
      2,
    ),
    'utf8',
  );
}

export async function buildServer(
  options?: Options,
  nitroConfig?: NitroConfig,
  routeSourceFiles?: Record<string, string>,
) {
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
  // reason. Force it here too until Rolldown's resolver matures.
  const nitro = await createNitro({
    dev: false,
    builder: 'rollup',
    preset: process.env['BUILD_PRESET'],
    ...nitroConfig,
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

      if (existsSync(indexFilePath)) {
        unlinkSync(indexFilePath);
      }
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

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      writeFileSync(outputPath, content, 'utf8');
    }
  }

  if (!options?.static) {
    console.log('Building Server...');
    await build(nitro);
    ensureVercelFunctionConfig(nitro);
  }

  await nitro.close();
}
