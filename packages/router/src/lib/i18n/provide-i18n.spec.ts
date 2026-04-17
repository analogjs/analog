import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  loadTranslationsRuntime,
  initI18n,
  detectClientLocale,
  replaceLocaleInPath,
  resolveI18nConfig,
  I18nConfig,
} from './provide-i18n';

describe('loadTranslationsRuntime', () => {
  let originalLocalize: any;

  beforeEach(() => {
    originalLocalize = (globalThis as any).$localize;
  });

  afterEach(() => {
    (globalThis as any).$localize = originalLocalize;
  });

  it('should store translations in $localize.TRANSLATIONS', () => {
    (globalThis as any).$localize = {};

    loadTranslationsRuntime({
      'msg-hello': 'Bonjour',
      'msg-goodbye': 'Au revoir',
    });

    const translations = (globalThis as any).$localize.TRANSLATIONS;
    expect(translations['msg-hello']).toBe('Bonjour');
    expect(translations['msg-goodbye']).toBe('Au revoir');
  });

  it('should merge with existing translations', () => {
    (globalThis as any).$localize = {};
    loadTranslationsRuntime({ 'msg-existing': 'Existant' });
    loadTranslationsRuntime({ 'msg-new': 'Nouveau' });

    const translations = (globalThis as any).$localize.TRANSLATIONS;
    expect(translations['msg-existing']).toBe('Existant');
    expect(translations['msg-new']).toBe('Nouveau');
  });

  it('should warn if $localize is not available', () => {
    (globalThis as any).$localize = undefined;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });

    loadTranslationsRuntime({ 'msg-hello': 'Bonjour' });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('$localize is not available'),
    );
    warnSpy.mockRestore();
  });
});

describe('initI18n', () => {
  let originalLocalize: any;

  beforeEach(() => {
    originalLocalize = (globalThis as any).$localize;
    (globalThis as any).$localize = {};
  });

  afterEach(() => {
    (globalThis as any).$localize = originalLocalize;
  });

  it('should skip the loader when the locale matches the source locale', async () => {
    const loader = vi.fn();
    const config: I18nConfig = {
      defaultLocale: 'en',
      locales: ['en', 'fr'],
      loader,
    };

    await initI18n(config, 'en');

    expect(loader).not.toHaveBeenCalled();
  });

  it('should load translations for a non-source locale', async () => {
    const config: I18nConfig = {
      defaultLocale: 'fr',
      locales: ['en', 'fr'],
      loader: vi.fn().mockResolvedValue({
        'msg-hello': 'Bonjour',
      }),
    };

    await initI18n(config, 'fr');

    expect(config.loader).toHaveBeenCalledWith('fr');
    expect((globalThis as any).$localize.TRANSLATIONS['msg-hello']).toBe(
      'Bonjour',
    );
  });

  it('should handle empty translations gracefully', async () => {
    const config: I18nConfig = {
      defaultLocale: 'fr',
      locales: ['en', 'fr'],
      loader: vi.fn().mockResolvedValue({}),
    };

    await initI18n(config, 'fr');

    expect(config.loader).toHaveBeenCalledWith('fr');
  });

  it('should support synchronous loaders', async () => {
    const config: I18nConfig = {
      defaultLocale: 'de',
      locales: ['en', 'de'],
      loader: () => ({ 'msg-hello': 'Hallo' }),
    };

    await initI18n(config, 'de');

    expect((globalThis as any).$localize.TRANSLATIONS['msg-hello']).toBe(
      'Hallo',
    );
  });

  it('should use the passed locale over defaultLocale', async () => {
    const config: I18nConfig = {
      defaultLocale: 'en',
      locales: ['en', 'fr'],
      loader: vi.fn().mockResolvedValue({ 'msg-hello': 'Bonjour' }),
    };

    await initI18n(config, 'fr');

    expect(config.loader).toHaveBeenCalledWith('fr');
  });

  it('should fall back to defaultLocale when no locale is passed', async () => {
    const config: I18nConfig = {
      defaultLocale: 'fr',
      locales: ['en', 'fr'],
      loader: vi.fn().mockResolvedValue({ 'msg-hello': 'Bonjour' }),
    };

    await initI18n(config);

    expect(config.loader).toHaveBeenCalledWith('fr');
  });
});

describe('detectClientLocale', () => {
  const baseConfig: I18nConfig = {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'de'],
    loader: vi.fn(),
  };

  it('should return defaultLocale when window is undefined (server)', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - partial window mock
    delete globalThis.window;

    expect(detectClientLocale(baseConfig as any)).toBe('en');

    globalThis.window = originalWindow;
  });

  it('should detect locale from URL path prefix', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - partial window mock
    globalThis.window = { location: { pathname: '/fr/about' } };

    expect(detectClientLocale(baseConfig as any)).toBe('fr');

    globalThis.window = originalWindow;
  });

  it('should return defaultLocale when URL has no locale prefix', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - partial window mock
    globalThis.window = { location: { pathname: '/about' } };

    expect(detectClientLocale(baseConfig as any)).toBe('en');

    globalThis.window = originalWindow;
  });

  it('should only match configured locales', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - partial window mock
    globalThis.window = { location: { pathname: '/es/about' } };

    expect(detectClientLocale(baseConfig as any)).toBe('en');

    globalThis.window = originalWindow;
  });

  it('should detect locale at root path', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - partial window mock
    globalThis.window = { location: { pathname: '/de' } };

    expect(detectClientLocale(baseConfig as any)).toBe('de');

    globalThis.window = originalWindow;
  });
});

describe('replaceLocaleInPath', () => {
  const locales = ['en', 'fr', 'de'];

  it('should swap an existing locale prefix', () => {
    expect(replaceLocaleInPath('/en/about', 'fr', locales)).toBe('/fr/about');
  });

  it('should swap locale at root', () => {
    expect(replaceLocaleInPath('/en', 'de', locales)).toBe('/de');
  });

  it('should prepend locale when no prefix exists', () => {
    expect(replaceLocaleInPath('/about', 'fr', locales)).toBe('/fr/about');
  });

  it('should prepend locale to root path', () => {
    expect(replaceLocaleInPath('/', 'fr', locales)).toBe('/fr');
  });

  it('should preserve nested path segments', () => {
    expect(replaceLocaleInPath('/en/blog/post-1', 'de', locales)).toBe(
      '/de/blog/post-1',
    );
  });
});

describe('resolveI18nConfig', () => {
  const loader = vi.fn();

  it('should use explicit config values when provided', () => {
    const resolved = resolveI18nConfig({
      defaultLocale: 'en',
      locales: ['en', 'fr'],
      loader,
    });

    expect(resolved.defaultLocale).toBe('en');
    expect(resolved.locales).toEqual(['en', 'fr']);
    expect(resolved.loader).toBe(loader);
  });

  it('should fall back to globals when config values are omitted', () => {
    (globalThis as any).ANALOG_I18N_DEFAULT_LOCALE = 'de';
    (globalThis as any).ANALOG_I18N_LOCALES = ['de', 'fr'];

    const resolved = resolveI18nConfig({ loader });

    expect(resolved.defaultLocale).toBe('de');
    expect(resolved.locales).toEqual(['de', 'fr']);

    delete (globalThis as any).ANALOG_I18N_DEFAULT_LOCALE;
    delete (globalThis as any).ANALOG_I18N_LOCALES;
  });

  it('should prefer explicit values over globals', () => {
    (globalThis as any).ANALOG_I18N_DEFAULT_LOCALE = 'de';
    (globalThis as any).ANALOG_I18N_LOCALES = ['de', 'fr'];

    const resolved = resolveI18nConfig({
      defaultLocale: 'en',
      locales: ['en', 'es'],
      loader,
    });

    expect(resolved.defaultLocale).toBe('en');
    expect(resolved.locales).toEqual(['en', 'es']);

    delete (globalThis as any).ANALOG_I18N_DEFAULT_LOCALE;
    delete (globalThis as any).ANALOG_I18N_LOCALES;
  });

  it('should throw when neither config nor globals provide values', () => {
    expect(() => resolveI18nConfig({ loader })).toThrow(
      'provideI18n() requires defaultLocale and locales',
    );
  });
});
