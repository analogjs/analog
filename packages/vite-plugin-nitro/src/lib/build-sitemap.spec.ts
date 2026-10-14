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

    const xml = spy.mock.calls[0][1] as string;
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

    const xml = spy.mock.calls[0][1] as string;
    expect(xml).toContain(
      'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    );
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });
});
