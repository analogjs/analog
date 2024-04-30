import { NitroConfig, copyPublicAssets, prerender } from 'nitropack';
import { createNitro, build, prepare } from 'nitropack';
import { existsSync, unlinkSync } from 'node:fs';

import { Options } from './options.js';
import { addPostRenderingHooks } from './hooks/post-rendering-hook.js';

export async function buildServer(
  options?: Options,
  nitroConfig?: NitroConfig
) {
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
    nitroConfig?.prerender?.routes.find((route) => route === '/')
  ) {
    // Remove the root index.html so it can be replaced with the prerendered version
    if (existsSync(`${nitroConfig?.output?.publicDir}/index.html`)) {
      unlinkSync(`${nitroConfig?.output?.publicDir}/index.html`);
    }
  }

  if (
    nitroConfig?.prerender?.routes &&
    nitroConfig?.prerender?.routes?.length > 0
  ) {
    console.log(`Prerendering static pages...`);
    await prerender(nitro);
  }

  if (!options?.static) {
    console.log('Building Server...');
    await build(nitro);
  }

  await nitro.close();
}
