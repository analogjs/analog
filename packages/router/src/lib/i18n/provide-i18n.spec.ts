import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  loadTranslationsRuntime,
  clearTranslationsRuntime,
  initI18n,
  detectClientLocale,
  replaceLocaleInPath,
  resolveI18nConfig,
  I18nConfig,
  ɵɵregisterI18nComponentDef,
  ɵɵresetI18nComponentDefCache,
  getI18nComponentDefRegistrySize,
  clearI18nComponentDefRegistry,
} from './provide-i18n';

describe('loadTranslationsRuntime', () => {
  let originalLocalize: any;

  beforeEach(() => {
    originalLocalize = (globalThis as any).$localize;
  });

  afterEach(() => {
    (globalThis as any).$localize = originalLocalize;
  });

  it('should store translations in the parsed shape $localize.translate expects', async () => {
    (globalThis as any).$localize = {};

    await loadTranslationsRuntime({
      'msg-hello': 'Bonjour',
      'msg-goodbye': 'Au revoir',
    });

    const translations = (globalThis as any).$localize.TRANSLATIONS;
    // `@angular/localize`'s `loadTranslations` parses each message into
    // `{ text, messageParts, placeholderNames }` so that the runtime
    // `translate()` function can build a translated template object.
    expect(translations['msg-hello']).toMatchObject({
      text: 'Bonjour',
      messageParts: ['Bonjour'],
      placeholderNames: [],
    });
    expect(translations['msg-goodbye']).toMatchObject({
      text: 'Au revoir',
      messageParts: ['Au revoir'],
      placeholderNames: [],
    });
  });

  it('should wire up $localize.translate so lookups actually happen', async () => {
    (globalThis as any).$localize = {};

    await loadTranslationsRuntime({ 'msg-hello': 'Bonjour' });

    expect(typeof (globalThis as any).$localize.translate).toBe('function');
  });

  it('should merge with existing translations', async () => {
    (globalThis as any).$localize = {};
    await loadTranslationsRuntime({ 'msg-existing': 'Existant' });
    await loadTranslationsRuntime({ 'msg-new': 'Nouveau' });

    const translations = (globalThis as any).$localize.TRANSLATIONS;
    expect(translations['msg-existing']).toMatchObject({ text: 'Existant' });
    expect(translations['msg-new']).toMatchObject({ text: 'Nouveau' });
  });

  it('should warn if $localize is not available', async () => {
    (globalThis as any).$localize = undefined;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await loadTranslationsRuntime({ 'msg-hello': 'Bonjour' });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('$localize is not available'),
    );
    warnSpy.mockRestore();
  });
});

describe('clearTranslationsRuntime', () => {
  let originalLocalize: any;

  beforeEach(() => {
    originalLocalize = (globalThis as any).$localize;
  });

  afterEach(() => {
    (globalThis as any).$localize = originalLocalize;
  });

  it('should drop $localize.translate and empty TRANSLATIONS', async () => {
    (globalThis as any).$localize = {};
    await loadTranslationsRuntime({ 'msg-hello': 'Bonjour' });
    expect((globalThis as any).$localize.translate).toBeTypeOf('function');

    await clearTranslationsRuntime();

    expect((globalThis as any).$localize.translate).toBeUndefined();
    expect((globalThis as any).$localize.TRANSLATIONS).toEqual({});
  });

  it('should no-op when $localize is not available', async () => {
    (globalThis as any).$localize = undefined;
    await expect(clearTranslationsRuntime()).resolves.toBeUndefined();
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

  it('should clear translations even when the source locale is active', async () => {
    // Simulate a prior render having loaded fr translations.
    await loadTranslationsRuntime({ 'msg-hello': 'Bonjour' });
    expect((globalThis as any).$localize.translate).toBeTypeOf('function');

    const config: I18nConfig = {
      defaultLocale: 'en',
      locales: ['en', 'fr'],
      loader: vi.fn(),
    };

    await initI18n(config, 'en');

    // Previously loaded fr translations must be dropped so that the
    // source locale's templates fall through to their source strings
    // rather than silently rendering stale fr values.
    expect((globalThis as any).$localize.translate).toBeUndefined();
    expect((globalThis as any).$localize.TRANSLATIONS).toEqual({});
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
    expect(
      (globalThis as any).$localize.TRANSLATIONS['msg-hello'],
    ).toMatchObject({
      text: 'Bonjour',
    });
  });

  it('should clear previous translations before loading new ones', async () => {
    // Pretend an earlier request loaded fr.
    await loadTranslationsRuntime({ 'msg-only-in-fr': 'Seulement' });

    const config: I18nConfig = {
      defaultLocale: 'en',
      locales: ['en', 'de'],
      loader: vi.fn().mockResolvedValue({ 'msg-only-in-de': 'Nur' }),
    };

    await initI18n(config, 'de');

    const translations = (globalThis as any).$localize.TRANSLATIONS;
    // The fr-only message must be gone; only the newly loaded de messages
    // should be present. Without clearing, the two maps would mix and a
    // /de request would still resolve fr-only messages.
    expect(translations['msg-only-in-fr']).toBeUndefined();
    expect(translations['msg-only-in-de']).toMatchObject({ text: 'Nur' });
  });

  it('should handle empty translations gracefully', async () => {
    const config: I18nConfig = {
      defaultLocale: 'fr',
      locales: ['en', 'fr'],
      loader: vi.fn().mockResolvedValue({}),
    };

    await initI18n(config, 'fr');

    expect(config.loader).toHaveBeenCalledWith('fr');
    expect((globalThis as any).$localize.TRANSLATIONS).toEqual({});
  });

  it('should support synchronous loaders', async () => {
    const config: I18nConfig = {
      defaultLocale: 'de',
      locales: ['en', 'de'],
      loader: () => ({ 'msg-hello': 'Hallo' }),
    };

    await initI18n(config, 'de');

    expect(
      (globalThis as any).$localize.TRANSLATIONS['msg-hello'],
    ).toMatchObject({
      text: 'Hallo',
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
    const originalWindow = globalThis.window;
    // @ts-ignore
    delete globalThis.window;

    expect(detectClientLocale(baseConfig as any)).toBe('en');

    globalThis.window = originalWindow;
  });

  it('should detect locale from URL path prefix', () => {
    const originalWindow = globalThis.window;
    // @ts-ignore
    globalThis.window = { location: { pathname: '/fr/about' } };

    expect(detectClientLocale(baseConfig as any)).toBe('fr');

    globalThis.window = originalWindow;
  });

  it('should return defaultLocale when URL has no locale prefix', () => {
    const originalWindow = globalThis.window;
    // @ts-ignore
    globalThis.window = { location: { pathname: '/about' } };

    expect(detectClientLocale(baseConfig as any)).toBe('en');

    globalThis.window = originalWindow;
  });

  it('should only match configured locales', () => {
    const originalWindow = globalThis.window;
    // @ts-ignore
    globalThis.window = { location: { pathname: '/es/about' } };

    expect(detectClientLocale(baseConfig as any)).toBe('en');

    globalThis.window = originalWindow;
  });

  it('should detect locale at root path', () => {
    const originalWindow = globalThis.window;
    // @ts-ignore
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

describe('component def registry', () => {
  beforeEach(() => {
    clearI18nComponentDefRegistry();
  });

  it('should null def.tView on registered components when reset', () => {
    const fakeDef = {
      template: () => undefined,
      tView: { someCachedValue: true },
    };
    ɵregisterI18nComponentDef(fakeDef);
    expect(getI18nComponentDefRegistrySize()).toBe(1);

    ɵresetI18nComponentDefCache();

    expect(fakeDef.tView).toBeNull();
    // The registry itself is intentionally preserved across resets so
    // that subsequent requests keep clearing the same defs.
    expect(getI18nComponentDefRegistrySize()).toBe(1);
  });

  it('should accept a Type with a ɵcmp static and unwrap it', () => {
    const fakeDef = { template: () => undefined, tView: {} };
    class FakeComponent {
      static ɵcmp = fakeDef;
    }

    ɵregisterI18nComponentDef(FakeComponent);
    ɵresetI18nComponentDefCache();

    expect(fakeDef.tView).toBeNull();
  });

  it('should ignore things that are not component defs', () => {
    ɵregisterI18nComponentDef(null);
    ɵregisterI18nComponentDef(undefined);
    ɵregisterI18nComponentDef({ notAComponent: true });
    ɵregisterI18nComponentDef(class Bare {});

    expect(getI18nComponentDefRegistrySize()).toBe(0);
  });

  it('should de-duplicate repeated registrations of the same def', () => {
    const fakeDef = { template: () => undefined, tView: {} };
    ɵregisterI18nComponentDef(fakeDef);
    ɵregisterI18nComponentDef(fakeDef);
    ɵregisterI18nComponentDef(fakeDef);

    expect(getI18nComponentDefRegistrySize()).toBe(1);
  });
});
