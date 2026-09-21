import { fileURLToPath } from 'node:url';
import type { NitroConfig } from 'nitropack';
import type { Options, I18nPrerenderOptions } from '../options.js';

export const I18N_WORKER_SSR_ENTRY = 'virtual:analog-i18n/main.server';

export function validateI18nWorkers(options: Options, nitro: NitroConfig) {
  if (!options.i18n?.loader) {
    throw new Error('i18n.workers requires an i18n.loader module.');
  }
  if (!options.ssr || nitro.preset !== 'node-server') {
    throw new Error('i18n.workers requires SSR and the node-server preset.');
  }
  if (
    options.experimental?.streaming ||
    nitro.experimental?.websocket ||
    Object.keys(nitro.scheduledTasks ?? {}).length
  ) {
    throw new Error(
      'i18n.workers does not support experimental streaming, WebSockets, or scheduled tasks.',
    );
  }
  const { locales, defaultLocale } = options.i18n;
  if (
    !locales.length ||
    new Set(locales).size !== locales.length ||
    !locales.includes(defaultLocale)
  ) {
    throw new Error(
      'i18n.workers requires unique locales including defaultLocale.',
    );
  }
}

export function resolveI18nWorkers(
  options: Options,
  nitro: NitroConfig,
): boolean {
  const i18n = options.i18n;
  if (!i18n || i18n.workers === false) return false;
  if (i18n.workers !== true && (!i18n.loader || i18n.locales.length < 2))
    return false;
  try {
    validateI18nWorkers(options, nitro);
    return true;
  } catch (error) {
    if (i18n.workers === true) throw error;
    console.warn(
      `[@analogjs/platform] Automatic i18n workers disabled: ${(error as Error).message} Concurrent cross-locale SSR remains unisolated.`,
    );
    return false;
  }
}

export function i18nWorkerSsrEntry(
  entry: string,
  loader: string,
  config: I18nPrerenderOptions,
) {
  return `
import '@angular/localize/init';
import { loadTranslations } from '@angular/localize';
import load from ${JSON.stringify(loader)};
import { setHtmlLang } from ${JSON.stringify(fileURLToPath(new URL('./i18n-prerender.js', import.meta.url)))};

const locale = process.env['ANALOG_I18N_LOCALE'];
let renderer;
export const i18nReady = locale ? (async () => {
  if (!${JSON.stringify(config.locales)}.includes(locale)) {
    throw new Error('Unsupported i18n worker locale: ' + locale);
  }
  if (locale !== ${JSON.stringify(config.locales[0])}) {
    loadTranslations(await load(locale));
  }
  renderer = (await import(${JSON.stringify(entry)})).default;
})() : Promise.resolve();

export default async function (...args) {
  if (!locale) throw new Error('This SSR build must run in its locale worker.');
  await i18nReady;
  args[1] = setHtmlLang(args[1], locale);
  return renderer(...args);
}
`;
}
