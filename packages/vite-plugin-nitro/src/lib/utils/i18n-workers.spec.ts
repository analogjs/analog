import { describe, expect, it } from 'vitest';
import { selectLocale } from '../runtime/locale-workers.mjs';
import { validateI18nWorkers } from './i18n-workers.js';
import type { Options } from '../options.js';

const i18n = {
  defaultLocale: 'es',
  locales: ['es', 'en'],
  workers: { loader: './src/i18n.ts' },
};

describe('fixed-locale worker routing', () => {
  it.each([
    ['/en/about?x=1', 'es', 'en'],
    ['/es', 'en', 'es'],
    ['/', 'en,es;q=0.5', 'en'],
    ['/about', 'es;q=0.5,en;q=0.9', 'en'],
    ['/', 'de,en;q=0.5', 'es'],
    ['/de/about', 'en', 'es'],
    ['/', undefined, 'es'],
  ])(
    'resolves %s with %s consistently with runtime i18n',
    (url, header, locale) => {
      expect(selectLocale(url, header, i18n)).toBe(locale);
    },
  );

  it('removes the deployment base path on a path boundary', () => {
    const config = { ...i18n, baseURL: '/base/' };
    expect(selectLocale('/base/en', undefined, config)).toBe('en');
    expect(selectLocale('/baseball/en', undefined, config)).toBe('es');
  });
});

describe('worker build constraints', () => {
  const options: Options = { ssr: true, i18n };
  it('accepts a Node SSR build without prerendering', () => {
    expect(() =>
      validateI18nWorkers(options, {
        preset: 'node-server',
        prerender: { routes: [] },
      }),
    ).not.toThrow();
  });
  it.each(['vercel', 'cloudflare', undefined])(
    'rejects unsupported preset %s',
    (preset) => {
      expect(() => validateI18nWorkers(options, { preset })).toThrow(
        'node-server',
      );
    },
  );
  it('rejects prerendering rather than silently producing incorrect locales', () => {
    expect(() =>
      validateI18nWorkers(options, {
        preset: 'node-server',
        prerender: { routes: ['/'] },
      }),
    ).toThrow('prerender');
  });
  it('rejects progressive streaming and invalid locale configuration', () => {
    expect(() =>
      validateI18nWorkers(
        { ...options, experimental: { streaming: true } },
        { preset: 'node-server' },
      ),
    ).toThrow('streaming');
    expect(() =>
      validateI18nWorkers(
        { ...options, i18n: { ...i18n, locales: ['en'] } },
        { preset: 'node-server' },
      ),
    ).toThrow('defaultLocale');
  });
});
