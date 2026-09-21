import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadOptions } from 'nitropack';
import { selectLocale } from '../runtime/locale-workers.mjs';
import { resolveI18nWorkers, validateI18nWorkers } from './i18n-workers.js';
import type { Options } from '../options.js';

const i18n = {
  defaultLocale: 'es',
  locales: ['es', 'en'],
  loader: './src/i18n.ts',
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

describe('automatic worker selection', () => {
  const options: Options = { ssr: true, i18n };
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses Nitro defaults and normalizes preset aliases before selection', async () => {
    const nitro = await loadOptions({
      preset: 'node_server',
      prerender: { routes: [] },
    });
    expect(nitro.preset).toBe('node-server');
    expect(resolveI18nWorkers(options, nitro)).toBe(true);
  });

  it('respects an environment-selected deployment and an explicit override', async () => {
    vi.stubEnv('NITRO_PRESET', 'vercel');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const nitro = await loadOptions({ prerender: { routes: [] } });
    expect(nitro.preset).toBe('vercel');
    expect(resolveI18nWorkers(options, nitro)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unisolated'));
    const explicit = await loadOptions({
      preset: 'node-server',
      prerender: { routes: [] },
    });
    expect(resolveI18nWorkers(options, explicit)).toBe(true);
  });

  it.each([
    { ...i18n, workers: false },
    { ...i18n, loader: undefined },
    { ...i18n, locales: ['es'] },
  ])('keeps existing behavior when disabled or unnecessary: %j', (config) => {
    expect(
      resolveI18nWorkers(
        { ...options, i18n: config },
        { preset: 'node-server' },
      ),
    ).toBe(false);
  });

  it.each([
    { preset: 'node-server', prerender: { routes: ['/'] } },
    { preset: 'node-server', experimental: { websocket: true } },
    { preset: 'node-server', scheduledTasks: { '* * * * *': ['task'] } },
    { preset: 'node-cluster' },
  ])('falls back for unsupported automatic configurations: %j', (nitro) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveI18nWorkers(options, nitro)).toBe(false);
    expect(() =>
      resolveI18nWorkers(
        { ...options, i18n: { ...i18n, workers: true } },
        nitro,
      ),
    ).toThrow();
  });

  it('requires a loader when workers are explicitly requested', () => {
    expect(() =>
      resolveI18nWorkers(
        { ...options, i18n: { ...i18n, loader: undefined, workers: true } },
        { preset: 'node-server' },
      ),
    ).toThrow('i18n.loader');
  });
});
