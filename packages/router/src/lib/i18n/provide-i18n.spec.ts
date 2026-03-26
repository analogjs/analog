import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  loadTranslationsRuntime,
  initI18n,
  detectClientLocale,
  replaceLocaleInPath,
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

  it('should set translations on $localize.TRANSLATIONS', () => {
    (globalThis as any).$localize = {};

    loadTranslationsRuntime({
      'msg-hello': 'Bonjour',
      'msg-goodbye': 'Au revoir',
    });

    expect((globalThis as any).$localize.TRANSLATIONS).toEqual({
      'msg-hello': 'Bonjour',
      'msg-goodbye': 'Au revoir',
    });
  });

  it('should merge with existing translations', () => {
    (globalThis as any).$localize = {
      TRANSLATIONS: { 'msg-existing': 'Existant' },
    };

    loadTranslationsRuntime({ 'msg-new': 'Nouveau' });

    expect((globalThis as any).$localize.TRANSLATIONS).toEqual({
      'msg-existing': 'Existant',
      'msg-new': 'Nouveau',
    });
  });

  it('should warn if $localize is not available', () => {
    (globalThis as any).$localize = undefined;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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

  it('should skip loading when locale matches the first (source) locale', async () => {
    const loader = vi.fn();
    const config: I18nConfig = {
      defaultLocale: 'en',
      locales: ['en', 'fr'],
      loader,
    };

    await initI18n(config, 'en');

    expect(loader).not.toHaveBeenCalled();
  });

  it('should load translations for non-source locale', async () => {
    const config: I18nConfig = {
      defaultLocale: 'fr',
      locales: ['en', 'fr'],
      loader: vi.fn().mockResolvedValue({
        'msg-hello': 'Bonjour',
      }),
    };

    await initI18n(config, 'fr');

    expect(config.loader).toHaveBeenCalledWith('fr');
    expect((globalThis as any).$localize.TRANSLATIONS).toEqual({
      'msg-hello': 'Bonjour',
    });
  });

  it('should handle empty translations gracefully', async () => {
    const config: I18nConfig = {
      defaultLocale: 'fr',
      locales: ['en', 'fr'],
      loader: vi.fn().mockResolvedValue({}),
    };

    await initI18n(config, 'fr');

    expect(config.loader).toHaveBeenCalledWith('fr');
    // Should not crash, TRANSLATIONS should not be set
    expect((globalThis as any).$localize.TRANSLATIONS).toBeUndefined();
  });

  it('should support synchronous loaders', async () => {
    const config: I18nConfig = {
      defaultLocale: 'de',
      locales: ['en', 'de'],
      loader: () => ({ 'msg-hello': 'Hallo' }),
    };

    await initI18n(config, 'de');

    expect((globalThis as any).$localize.TRANSLATIONS).toEqual({
      'msg-hello': 'Hallo',
    });
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
    // In Node test environment, window is typically undefined
    const originalWindow = globalThis.window;
    // @ts-ignore
    delete globalThis.window;

    expect(detectClientLocale(baseConfig)).toBe('en');

    globalThis.window = originalWindow;
  });

  it('should detect locale from URL path prefix', () => {
    const originalWindow = globalThis.window;
    // @ts-ignore
    globalThis.window = { location: { pathname: '/fr/about' } };

    expect(detectClientLocale(baseConfig)).toBe('fr');

    globalThis.window = originalWindow;
  });

  it('should return defaultLocale when URL has no locale prefix', () => {
    const originalWindow = globalThis.window;
    // @ts-ignore
    globalThis.window = { location: { pathname: '/about' } };

    expect(detectClientLocale(baseConfig)).toBe('en');

    globalThis.window = originalWindow;
  });

  it('should only match configured locales', () => {
    const originalWindow = globalThis.window;
    // @ts-ignore
    globalThis.window = { location: { pathname: '/es/about' } };

    // 'es' is not in the locales list
    expect(detectClientLocale(baseConfig)).toBe('en');

    globalThis.window = originalWindow;
  });

  it('should detect locale at root path', () => {
    const originalWindow = globalThis.window;
    // @ts-ignore
    globalThis.window = { location: { pathname: '/de' } };

    expect(detectClientLocale(baseConfig)).toBe('de');

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
