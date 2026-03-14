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

/**
 * Ensures a minimal `tsconfig.json` exists in the SSR output directory.
 *
 * Nitro v3's `nitro:oxc` Rollup plugin uses OXC's resolver for every
 * file it transforms. OXC walks up the directory tree looking for a
 * `tsconfig.json` to load path aliases. The SSR output directory
 * (`dist/<app>/ssr/`) is outside the source tree, so no tsconfig
 * exists there. On Windows, OXC's upward directory walk also fails to
 * reach the project root's tsconfig due to path normalisation issues,
 * causing:
 *
 *   [TSCONFIG_ERROR] Failed to load tsconfig for
 *     '../../dist/apps/blog-app/ssr/main.server.js': Tsconfig not found
 *
 * Writing a minimal tsconfig satisfies the resolver without adding any
 * path aliases that would interfere with Nitro's own module resolution.
 */
function ensureSsrTsconfig(nitroConfig: NitroConfig | undefined) {
  const ssrEntry = nitroConfig?.alias?.['#analog/ssr'];
  if (!ssrEntry) {
    return;
  }

  // The alias value is a normalized absolute path (forward slashes on
  // all platforms). Convert to a native path for dirname().
  const ssrDir = dirname(ssrEntry.replace(/\//g, join('a', 'b')[1]));
  const tsconfigPath = join(ssrDir, 'tsconfig.json');

  if (existsSync(tsconfigPath)) {
    return;
  }

  writeFileSync(
    tsconfigPath,
    JSON.stringify(
      { compilerOptions: { module: 'ESNext', moduleResolution: 'bundler' } },
      null,
      2,
    ),
    'utf8',
  );
}

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
  // ── Ensure the SSR output has a tsconfig for OXC ─────────────────
  //
  // Must run before createNitro() so the tsconfig is on disk when the
  // nitro:oxc plugin initialises its resolver.
  ensureSsrTsconfig(nitroConfig);

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
