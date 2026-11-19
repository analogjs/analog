import { buildSitemap } from './build-sitemap';
import * as fs from 'node:fs';

vi.mock('node:fs');

describe('build sitemap', () => {
  const config = { root: 'root' };
  const sitemapConfig = { host: 'http://host.com' };

  it('should not perform functionality if no predefined routes are present', () => {
    const spy = vi.spyOn(fs, 'writeFileSync');
    buildSitemap(config, sitemapConfig, [], '');

    expect(spy).not.toHaveBeenCalled();
  });

  it('should declare the http sitemap namespace', async () => {
    const spy = vi.spyOn(fs, 'writeFileSync');

    await buildSitemap(config, sitemapConfig, ['/about'], 'dist', {});

    const xml = spy.mock.calls.at(-1)![1] as string;
    expect(xml).toContain(
      'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    );
    expect(xml).not.toContain('xmlns:xhtml');
  });

  it('should declare the http xhtml namespace when i18n is enabled', async () => {
    const spy = vi.spyOn(fs, 'writeFileSync');

    await buildSitemap(
      config,
      sitemapConfig,
      ['/about'],
      'dist',
      {},
      {
        defaultLocale: 'en',
        locales: ['en', 'fr'],
      },
    );

    const xml = spy.mock.calls.at(-1)![1] as string;
    expect(xml).toContain(
      'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    );
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });

  it('should exclude internal static-data routes', async () => {
    const spy = vi.spyOn(fs, 'writeFileSync');

    await buildSitemap(
      config,
      sitemapConfig,
      ['/about', '/api/_analog/pages//about'],
      'dist',
      {},
    );

    const xml = spy.mock.calls.at(-1)![1] as string;
    expect(xml).toContain('<loc>http://host.com/about</loc>');
    expect(xml).not.toContain('_analog');
  });

  it('should exclude internal static-data routes under a custom api prefix', async () => {
    const spy = vi.spyOn(fs, 'writeFileSync');

    await buildSitemap(
      config,
      sitemapConfig,
      ['/about', '/services/_analog/pages//about'],
      'dist',
      {},
      undefined,
      '/services',
    );

    const xml = spy.mock.calls.at(-1)![1] as string;
    expect(xml).toContain('<loc>http://host.com/about</loc>');
    expect(xml).not.toContain('_analog');
  });

  it('should apply per-route sitemap config when the host ends with a slash', async () => {
    const spy = vi.spyOn(fs, 'writeFileSync');

    await buildSitemap(
      config,
      { host: 'http://host.com/' },
      ['/about'],
      'dist',
      {
        '/about': {
          lastmod: '2024-01-01',
          changefreq: 'weekly',
          priority: '0.5',
        },
      },
    );

    const xml = spy.mock.calls.at(-1)![1] as string;
    expect(xml).toContain('<loc>http://host.com/about</loc>');
    expect(xml).toContain('<lastmod>2024-01-01</lastmod>');
    expect(xml).toContain('<changefreq>weekly</changefreq>');
    expect(xml).toContain('<priority>0.5</priority>');
  });

  it('should still apply per-route sitemap config keyed without a leading slash', async () => {
    const spy = vi.spyOn(fs, 'writeFileSync');

    await buildSitemap(
      config,
      { host: 'http://host.com/' },
      ['/about'],
      'dist',
      { about: { lastmod: '2024-01-01' } },
    );

    const xml = spy.mock.calls.at(-1)![1] as string;
    expect(xml).toContain('<lastmod>2024-01-01</lastmod>');
  });
});
