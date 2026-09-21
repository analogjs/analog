import { NitroConfig, copyPublicAssets, prerender } from 'nitropack';
import { createNitro, build, prepare } from 'nitropack';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Options } from './options.js';
import { addPostRenderingHooks } from './hooks/post-rendering-hook.js';
import { validateI18nWorkers } from './utils/i18n-workers.js';

export async function buildServer(
  options?: Options,
  nitroConfig: NitroConfig = {},
  routeSourceFiles?: Record<string, string>,
) {
  if (options?.i18n?.workers) {
    validateI18nWorkers(options, nitroConfig);
    nitroConfig = {
      ...nitroConfig,
      entry: fileURLToPath(
        new URL('./runtime/locale-worker-entry.mjs', import.meta.url),
      ),
      externals: {
        ...nitroConfig.externals,
        inline: [...(nitroConfig.externals?.inline ?? []), '@analogjs/router'],
      },
      replace: {
        ...nitroConfig.replace,
        ANALOG_I18N_FIXED_LOCALE: "process.env['ANALOG_I18N_LOCALE']",
        ANALOG_I18N_DEFAULT_LOCALE: JSON.stringify(options.i18n.defaultLocale),
        ANALOG_I18N_LOCALES: JSON.stringify(options.i18n.locales),
      },
      virtual: {
        ...nitroConfig.virtual,
        '#analog/i18n-workers': `export default ${JSON.stringify({
          locales: options.i18n.locales,
          defaultLocale: options.i18n.defaultLocale,
          baseURL: nitroConfig.baseURL || '/',
        })}`,
      },
    };
  }
  const nitro = await createNitro({
    dev: false,
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
      const indexFilePath = `${nitroConfig?.output?.publicDir}/index.html${fileExt ? `${fileExt}` : ''}`;

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
  }

  await nitro.close();
}
