import { describe, expect, it } from 'vitest';
import {
  expandRoutesWithLocales,
  detectLocaleFromRoute,
  setHtmlLang,
} from './i18n-prerender';
import { getHreflangAlternates, stripLocalePrefix } from '../build-sitemap';
import { I18nPrerenderOptions } from '../options';

const i18n: I18nPrerenderOptions = {
  defaultLocale: 'en',
  locales: ['en', 'fr', 'de'],
};

describe('expandRoutesWithLocales', () => {
  it('should expand a single route to all locales', () => {
    const result = expandRoutesWithLocales(['/about'], i18n);

    expect(result).toContain('/en/about');
    expect(result).toContain('/fr/about');
    expect(result).toContain('/de/about');
  });

  it('should handle the root route', () => {
    const result = expandRoutesWithLocales(['/'], i18n);

    expect(result).toContain('/en');
    expect(result).toContain('/fr');
    expect(result).toContain('/de');
  });

  it('should keep the unprefixed root route for the default locale', () => {
    const result = expandRoutesWithLocales(['/'], i18n);

    expect(result).toContain('/');
  });

  it('should not prefix API routes', () => {
    const result = expandRoutesWithLocales(
      ['/about', '/api/v1/users', '/api/_analog/pages/about'],
      i18n,
    );

    expect(result).toContain('/api/v1/users');
    expect(result).toContain('/api/_analog/pages/about');
    expect(result).not.toContain('/en/api/v1/users');
  });

  it('should expand multiple routes', () => {
    const result = expandRoutesWithLocales(['/about', '/contact'], i18n);

    expect(result).toContain('/en/about');
    expect(result).toContain('/fr/about');
    expect(result).toContain('/de/about');
    expect(result).toContain('/en/contact');
    expect(result).toContain('/fr/contact');
    expect(result).toContain('/de/contact');
  });

  it('should not duplicate routes', () => {
    const result = expandRoutesWithLocales(['/about'], i18n);
    const aboutRoutes = result.filter((r) => r === '/about');

    expect(aboutRoutes.length).toBeLessThanOrEqual(1);
  });
});

describe('detectLocaleFromRoute', () => {
  it('should detect locale from route prefix', () => {
    expect(detectLocaleFromRoute('/fr/about', i18n)).toBe('fr');
    expect(detectLocaleFromRoute('/de/contact', i18n)).toBe('de');
    expect(detectLocaleFromRoute('/en', i18n)).toBe('en');
  });

  it('should return defaultLocale for routes without locale prefix', () => {
    expect(detectLocaleFromRoute('/about', i18n)).toBe('en');
    expect(detectLocaleFromRoute('/', i18n)).toBe('en');
  });

  it('should not match non-configured locales', () => {
    expect(detectLocaleFromRoute('/es/about', i18n)).toBe('en');
  });
});

describe('setHtmlLang', () => {
  it('should add lang attribute to html tag', () => {
    const html = '<html><head></head></html>';
    const result = setHtmlLang(html, 'fr');

    expect(result).toBe('<html lang="fr"><head></head></html>');
  });

  it('should replace existing lang attribute', () => {
    const html = '<html lang="en"><head></head></html>';
    const result = setHtmlLang(html, 'de');

    expect(result).toBe('<html lang="de"><head></head></html>');
  });

  it('should preserve other attributes on html tag', () => {
    const html = '<html class="dark" lang="en" dir="ltr"><head></head></html>';
    const result = setHtmlLang(html, 'fr');

    expect(result).toContain('lang="fr"');
    expect(result).toContain('class="dark"');
    expect(result).toContain('dir="ltr"');
  });
});

describe('getHreflangAlternates', () => {
  it('should generate alternates for all locales plus x-default', () => {
    const alternates = getHreflangAlternates(
      'https://example.com/fr/about',
      'https://example.com',
      i18n,
    );

    expect(alternates).toContainEqual({
      locale: 'en',
      href: 'https://example.com/en/about',
    });
    expect(alternates).toContainEqual({
      locale: 'fr',
      href: 'https://example.com/fr/about',
    });
    expect(alternates).toContainEqual({
      locale: 'de',
      href: 'https://example.com/de/about',
    });
    expect(alternates).toContainEqual({
      locale: 'x-default',
      href: 'https://example.com/en/about',
    });
  });

  it('should handle root locale paths', () => {
    const alternates = getHreflangAlternates(
      'https://example.com/fr',
      'https://example.com',
      i18n,
    );

    expect(alternates).toContainEqual({
      locale: 'en',
      href: 'https://example.com/en',
    });
    expect(alternates).toContainEqual({
      locale: 'fr',
      href: 'https://example.com/fr',
    });
  });

  it('should handle host with trailing slash', () => {
    const alternates = getHreflangAlternates(
      'https://example.com/en/about',
      'https://example.com/',
      i18n,
    );

    expect(alternates).toContainEqual({
      locale: 'en',
      href: 'https://example.com/en/about',
    });
  });
});

describe('stripLocalePrefix', () => {
  it('should strip locale from path', () => {
    expect(stripLocalePrefix('/fr/about', ['en', 'fr'])).toBe('/about');
    expect(stripLocalePrefix('/en/products/123', ['en', 'fr'])).toBe(
      '/products/123',
    );
  });

  it('should return root for locale-only path', () => {
    expect(stripLocalePrefix('/fr', ['en', 'fr'])).toBe('/');
  });

  it('should return path unchanged if no locale prefix', () => {
    expect(stripLocalePrefix('/about', ['en', 'fr'])).toBe('/about');
  });

  it('should return root for empty path', () => {
    expect(stripLocalePrefix('', ['en', 'fr'])).toBe('/');
  });
});
