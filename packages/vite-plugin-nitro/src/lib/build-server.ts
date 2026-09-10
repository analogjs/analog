import type { NitroConfig } from 'nitro/types';
import {
  build,
  copyPublicAssets,
  createNitro,
  prepare,
  prerender,
} from 'nitro/builder';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

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
  const nitro = await createNitro({
    dev: false,
    preset: process.env['BUILD_PRESET'],
    ...nitroConfig,
    builder:
      nitroConfig?.builder ??
      (process.env['NITRO_BUILDER'] ? undefined : 'rolldown'),
    static: options?.static ?? nitroConfig?.static,
  });

  nitro.hooks.hook('prerender:config', (config) => {
    config.output = {
      ...config.output,
      publicDir: nitro.options.output.publicDir,
      serverDir: resolve(nitro.options.buildDir, 'prerender'),
    };
  });

  if (options?.prerender?.postRenderingHooks) {
    addPostRenderingHooks(nitro, options.prerender.postRenderingHooks);
  }

  try {
    await prepare(nitro);
    await copyPublicAssets(nitro);

    if (
      options?.ssr &&
      nitroConfig?.prerender?.routes &&
      (nitroConfig?.prerender?.routes.find((route) => route === '/') ||
        nitroConfig?.prerender?.routes?.length === 0)
    ) {
      const indexFileExts = ['', '.br', '.gz', '.zst'];

      indexFileExts.forEach((fileExt) => {
        // Remove stale compressed and uncompressed root HTML.
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

    if (!nitro.options.static) {
      console.log('Building Server...');
      await build(nitro);
    }
  } finally {
    await nitro.close();
  }
}
