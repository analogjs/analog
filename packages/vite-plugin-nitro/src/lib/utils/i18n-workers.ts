import { fileURLToPath } from 'node:url';
import type { NitroConfig } from 'nitropack';
import type { Options, I18nPrerenderOptions } from '../options.js';

export const I18N_WORKER_SSR_ENTRY = 'virtual:analog-i18n/main.server';

export function validateI18nWorkers(options: Options, nitro: NitroConfig) {
  if (!options.i18n?.workers) return;
  if (!options.ssr || options.static || nitro.preset !== 'node-server') {
    throw new Error(
      'i18n.workers requires SSR and the explicit node-server preset.',
    );
  }
  if (nitro.prerender?.routes?.length || nitro.prerender?.crawlLinks) {
    throw new Error('i18n.workers requires prerender: { routes: [] }.');
  }
  if (
    options.experimental?.streaming ||
    nitro.experimental?.websocket ||
    nitro.scheduledTasks
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
