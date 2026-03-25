import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { buildSitemap } from './build-sitemap';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('build sitemap', () => {
  const config = { root: 'root' };
  const existsSyncMock = vi.mocked(existsSync);
  const mkdirSyncMock = vi.mocked(mkdirSync);
  const writeFileSyncMock = vi.mocked(writeFileSync);

  afterEach(() => {
    vi.restoreAllMocks();
    existsSyncMock.mockReturnValue(true);
    mkdirSyncMock.mockReset();
    writeFileSyncMock.mockReset();
  });

  it('should not perform functionality if no predefined routes are present', async () => {
    await buildSitemap(config, { host: 'https://host.com' }, [], '', {});

    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it('should preserve route sitemap metadata when the host has a trailing slash', async () => {
    existsSyncMock.mockReturnValue(true);

    await buildSitemap(
      config,
      { host: 'https://host.com/' },
      ['/blog'],
      '/tmp/analog/public',
      {
        '/blog': {
          lastmod: '2024-01-15',
          changefreq: 'weekly',
          priority: 0.8,
        },
      },
    );

    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/analog/public/sitemap.xml'),
      expect.stringContaining('<loc>https://host.com/blog</loc>'),
    );
    expect(writeFileSyncMock.mock.calls[0]?.[1]).toContain(
      '<lastmod>2024-01-15</lastmod>',
    );
    expect(writeFileSyncMock.mock.calls[0]?.[1]).toContain(
      '<changefreq>weekly</changefreq>',
    );
    expect(writeFileSyncMock.mock.calls[0]?.[1]).toContain(
      '<priority>0.8</priority>',
    );
  });

  it('should apply include defaults transform exclude and internal route filtering', async () => {
    existsSyncMock.mockReturnValue(true);

    await buildSitemap(
      config,
      {
        host: 'https://host.com',
        defaults: {
          changefreq: 'monthly',
          priority: 0.4,
        },
        include: async () => [
          '/extra',
          {
            route: '/docs/hello world',
            lastmod: '2024-01-01',
          },
        ],
        exclude: ['/drafts/**', /^\/admin/],
        transform: (entry) =>
          entry.route === '/extra'
            ? {
                route: '/extra-updated',
                priority: 0.9,
              }
            : {
                route: entry.route,
              },
      },
      [
        '/products',
        '/products',
        '/drafts/preview',
        '/api/_analog/pages/products',
      ],
      '/tmp/analog/public',
      {},
    );

    const xml = writeFileSyncMock.mock.calls[0]?.[1] ?? '';
    expect(xml).toContain('<loc>https://host.com/products</loc>');
    expect(xml).toContain('<changefreq>monthly</changefreq>');
    expect(xml).toContain('<priority>0.4</priority>');
    expect(xml).toContain('<loc>https://host.com/extra-updated</loc>');
    expect(xml).toContain('<priority>0.9</priority>');
    expect(xml).toContain('<loc>https://host.com/docs/hello%20world</loc>');
    expect(xml).not.toContain('/drafts/preview');
    expect(xml).not.toContain('/api/_analog/pages/products');
  });

  it('should support predicate exclude rules and transform returning false', async () => {
    existsSyncMock.mockReturnValue(true);

    await buildSitemap(
      config,
      {
        host: 'https://host.com',
        exclude: [async (entry) => entry.route === '/private'],
        transform: (entry) =>
          entry.route === '/skip-me'
            ? false
            : {
                route: entry.route,
              },
      },
      ['/public', '/private', '/skip-me'],
      '/tmp/analog/public',
      {},
    );

    const xml = writeFileSyncMock.mock.calls[0]?.[1] ?? '';
    expect(xml).toContain('<loc>https://host.com/public</loc>');
    expect(xml).not.toContain('/private');
    expect(xml).not.toContain('/skip-me');
    expect(xml).not.toContain('<lastmod>');
  });

  it('should resolve callable per-route sitemap metadata', async () => {
    existsSyncMock.mockReturnValue(true);

    await buildSitemap(
      config,
      { host: 'https://host.com/' },
      ['/blog'],
      '/tmp/analog/public',
      {
        '/blog': () => ({
          lastmod: '2024-04-01',
          changefreq: 'daily',
        }),
      },
    );

    const xml = writeFileSyncMock.mock.calls[0]?.[1] ?? '';
    expect(xml).toContain('<loc>https://host.com/blog</loc>');
    expect(xml).toContain('<lastmod>2024-04-01</lastmod>');
    expect(xml).toContain('<changefreq>daily</changefreq>');
  });

  it('should filter internal routes when a custom api prefix is configured', async () => {
    existsSyncMock.mockReturnValue(true);

    await buildSitemap(
      config,
      { host: 'https://host.com' },
      ['/shop', '/functions/_analog/pages/shop'],
      '/tmp/analog/public',
      {},
      { apiPrefix: 'functions' },
    );

    const xml = writeFileSyncMock.mock.calls[0]?.[1] ?? '';
    expect(xml).toContain('<loc>https://host.com/shop</loc>');
    expect(xml).not.toContain('/functions/_analog/pages/shop');
  });

  it('should create the output directory when it does not exist', async () => {
    existsSyncMock.mockReturnValue(false);

    await buildSitemap(
      config,
      { host: 'https://host.com' },
      ['/'],
      '/tmp/generated/public',
      {},
    );

    expect(mkdirSyncMock).toHaveBeenCalledWith('/tmp/generated/public', {
      recursive: true,
    });
    expect(writeFileSyncMock).toHaveBeenCalled();
  });

  it('should refuse to write to the current working directory', async () => {
    existsSyncMock.mockReturnValue(true);
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await buildSitemap(config, { host: 'https://host.com' }, ['/'], '', {});

    expect(writeFileSyncMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unable to write file at'),
      expect.any(Error),
    );
  });

  it('should reject invalid sitemap hosts before writing output', async () => {
    await expect(
      buildSitemap(
        config,
        { host: 'not-a-valid-url' },
        ['/'],
        '/tmp/analog/public',
        {},
      ),
    ).rejects.toThrow();

    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });
});
