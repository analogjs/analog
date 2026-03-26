import { describe, expect, it, vi } from 'vitest';
import {
  detectLocale,
  extractLocaleFromUrl,
  parseAcceptLanguage,
} from './provide-server-context';

describe('extractLocaleFromUrl', () => {
  it('should extract a 2-letter locale from URL prefix', () => {
    expect(extractLocaleFromUrl('/fr/about')).toBe('fr');
    expect(extractLocaleFromUrl('/en/products/123')).toBe('en');
    expect(extractLocaleFromUrl('/de')).toBe('de');
  });

  it('should extract a locale with region from URL prefix', () => {
    expect(extractLocaleFromUrl('/en-US/about')).toBe('en-US');
    expect(extractLocaleFromUrl('/zh-CN/products')).toBe('zh-CN');
  });

  it('should return undefined for non-locale path segments', () => {
    expect(extractLocaleFromUrl('/about')).toBe(undefined);
    expect(extractLocaleFromUrl('/products/123')).toBe(undefined);
    expect(extractLocaleFromUrl('/api/v1/users')).toBe(undefined);
  });

  it('should return undefined for empty or root URL', () => {
    expect(extractLocaleFromUrl('/')).toBe(undefined);
    expect(extractLocaleFromUrl('')).toBe(undefined);
  });

  it('should ignore query parameters', () => {
    expect(extractLocaleFromUrl('/fr/about?page=1')).toBe('fr');
    expect(extractLocaleFromUrl('/about?lang=fr')).toBe(undefined);
  });
});

describe('parseAcceptLanguage', () => {
  it('should return the highest priority locale', () => {
    expect(parseAcceptLanguage('en-US,en;q=0.9,fr;q=0.8')).toBe('en-US');
  });

  it('should respect quality values', () => {
    expect(parseAcceptLanguage('fr;q=0.8,en;q=0.9,de;q=0.7')).toBe('en');
  });

  it('should handle a single locale', () => {
    expect(parseAcceptLanguage('fr')).toBe('fr');
  });

  it('should return undefined for empty or undefined header', () => {
    expect(parseAcceptLanguage(undefined)).toBe(undefined);
    expect(parseAcceptLanguage('')).toBe(undefined);
  });

  it('should default quality to 1 when not specified', () => {
    expect(parseAcceptLanguage('fr,en;q=0.9')).toBe('fr');
  });
});

describe('detectLocale', () => {
  function createMockRequest(url: string, acceptLanguage?: string): any {
    return {
      originalUrl: url,
      url,
      headers: {
        'accept-language': acceptLanguage,
      },
    };
  }

  it('should prefer URL prefix over Accept-Language', () => {
    const req = createMockRequest('/fr/about', 'en-US,en;q=0.9');
    expect(detectLocale(req)).toBe('fr');
  });

  it('should fall back to Accept-Language when no URL locale', () => {
    const req = createMockRequest('/about', 'de,en;q=0.9');
    expect(detectLocale(req)).toBe('de');
  });

  it('should return undefined when no locale can be detected', () => {
    const req = createMockRequest('/about', undefined);
    expect(detectLocale(req)).toBe(undefined);
  });

  it('should detect locale with region from URL', () => {
    const req = createMockRequest('/en-US/dashboard');
    expect(detectLocale(req)).toBe('en-US');
  });
});
