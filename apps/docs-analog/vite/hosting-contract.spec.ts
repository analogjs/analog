import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(APP_ROOT, '../..');

const nginxConf = readFileSync(
  resolve(APP_ROOT, 'zerops/site_config.tmpl'),
  'utf8',
);
const zeropsYaml = readFileSync(resolve(REPO_ROOT, 'zerops.yaml'), 'utf8');

/**
 * The agent-facing hosting contract lives in nginx config and static files
 * rather than code — pin its critical pieces so a refactor can't silently
 * bring back soft-404s or drop content negotiation.
 */
describe('hosting contract', () => {
  it('zerops.yaml deploys the custom nginx site config', () => {
    expect(zeropsYaml).toContain('base: nginx@latest');
    expect(zeropsYaml).toContain(
      'siteConfigPath: apps/docs-analog/zerops/site_config.tmpl',
    );
    expect(zeropsYaml).toContain('- apps/docs-analog/zerops/site_config.tmpl');
  });

  it('returns real 404s instead of the SPA fallback', () => {
    expect(nginxConf).toContain(
      'try_files $uri $uri.html $uri/index.html =404;',
    );
    expect(nginxConf).not.toMatch(/try_files[^;]*\/index\.html;/);
    expect(nginxConf).toContain('error_page 404 /404.html;');
  });

  it('serves structured JSON errors for /api/ misses', () => {
    expect(nginxConf).toContain('location ^~ /api/');
    expect(nginxConf).toContain('error_page 404 /api/v1/errors/404.json;');
  });

  it('negotiates Accept: text/markdown with a Vary: Accept header', () => {
    expect(nginxConf).toContain('$http_accept ~* "text/markdown"');
    expect(nginxConf).toContain(
      'add_header Vary "Accept, Accept-Encoding" always;',
    );
    expect(nginxConf).toContain('default_type text/markdown;');
    expect(nginxConf).toContain('error_page 404 /404.md;');
  });

  it('ships the static agent files the nginx config references', () => {
    for (const file of [
      'public/404.html',
      'public/404.md',
      'public/index.md',
      'public/about.md',
      'public/contact.md',
      'public/privacy.md',
      'public/developers.md',
      'public/robots.txt',
    ]) {
      expect(existsSync(resolve(APP_ROOT, file)), file).toBe(true);
    }
  });

  it('points 404 bodies at the machine-readable indexes', () => {
    const html = readFileSync(resolve(APP_ROOT, 'public/404.html'), 'utf8');
    const md = readFileSync(resolve(APP_ROOT, 'public/404.md'), 'utf8');
    for (const body of [html, md]) {
      expect(body).toContain('/llms.txt');
      expect(body).toContain('/openapi.json');
      expect(body).toContain('/sitemap.xml');
    }
  });
});
