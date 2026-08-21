import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentResourcesPlugin, buildOpenApiSpec } from './agent-resources';
import { collectDocs } from './docs-corpus';

const SITE_URL = 'https://example.test';

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'agent-resources-'));
  const contentDir = join(root, 'content');
  const distDir = join(root, 'dist');
  mkdirSync(join(contentDir, 'features'), { recursive: true });
  mkdirSync(join(contentDir, 'de'), { recursive: true });
  mkdirSync(distDir, { recursive: true });
  writeFileSync(
    join(contentDir, 'introduction.md'),
    '---\ntitle: Introduction\ndescription: What Analog is\n---\n\n# Introduction\n\nBody text.\n',
  );
  writeFileSync(
    join(contentDir, 'features', 'routing.md'),
    '---\ntitle: Routing\n---\n\n# Routing\n\nRoutes.\n',
  );
  // Translated doc must be excluded from the API surface
  writeFileSync(
    join(contentDir, 'de', 'introduction.md'),
    '---\ntitle: Einführung\n---\n\n# Einführung\n',
  );
  return { contentDir, distDir };
}

function runPlugin(contentDir: string, distDir: string) {
  const plugin = agentResourcesPlugin({
    siteUrl: SITE_URL,
    siteName: 'Analog',
    contentDir,
    distDir,
    skipLocales: ['de'],
  });
  const closeBundle = plugin.closeBundle as () => void;
  closeBundle.call({ info: () => undefined });
}

describe('agentResourcesPlugin', () => {
  it('writes a JSON docs index with per-representation URLs', () => {
    const { contentDir, distDir } = makeFixture();
    runPlugin(contentDir, distDir);

    const index = JSON.parse(
      readFileSync(resolve(distDir, 'api/v1/docs.json'), 'utf8'),
    );
    expect(index.count).toBe(2);
    expect(index.docs.map((d: { slug: string }) => d.slug)).toEqual([
      'features/routing',
      'introduction',
    ]);
    const intro = index.docs[1];
    expect(intro.title).toBe('Introduction');
    expect(intro.description).toBe('What Analog is');
    expect(intro.url).toBe(`${SITE_URL}/docs/introduction`);
    expect(intro.markdownUrl).toBe(`${SITE_URL}/docs/introduction.md`);
    expect(intro.jsonUrl).toBe(`${SITE_URL}/api/v1/docs/introduction.json`);
  });

  it('writes one JSON document per doc with the markdown body', () => {
    const { contentDir, distDir } = makeFixture();
    runPlugin(contentDir, distDir);

    const doc = JSON.parse(
      readFileSync(
        resolve(distDir, 'api/v1/docs/features/routing.json'),
        'utf8',
      ),
    );
    expect(doc.slug).toBe('features/routing');
    expect(doc.content).toContain('# Routing');
    // The index-only field is not duplicated into the document itself.
    expect(doc.jsonUrl).toBeUndefined();
  });

  it('writes a structured JSON 404 error document with hints', () => {
    const { contentDir, distDir } = makeFixture();
    runPlugin(contentDir, distDir);

    const err = JSON.parse(
      readFileSync(resolve(distDir, 'api/v1/errors/404.json'), 'utf8'),
    );
    expect(err.error.code).toBe('not_found');
    expect(err.error.status).toBe(404);
    expect(err.error.message.length).toBeGreaterThan(0);
    expect(err.error.hints.join('\n')).toContain(
      `${SITE_URL}/api/v1/docs.json`,
    );
    expect(err.error.hints.join('\n')).toContain(`${SITE_URL}/openapi.json`);
  });

  it('publishes a self-describing OpenAPI 3.1 spec', () => {
    const { contentDir, distDir } = makeFixture();
    runPlugin(contentDir, distDir);

    const spec = JSON.parse(
      readFileSync(resolve(distDir, 'openapi.json'), 'utf8'),
    );
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers[0].url).toBe(SITE_URL);

    const operations = Object.values(
      spec.paths as Record<string, { get: Record<string, unknown> }>,
    ).map((p) => p.get);
    // Every operation carries an operationId, description, and responses.
    const ids = operations.map((op) => op['operationId']);
    expect(ids).toContain('listDocs');
    expect(ids).toContain('getDoc');
    expect(ids).toContain('getDocMarkdown');
    expect(new Set(ids).size).toBe(ids.length);
    for (const op of operations) {
      expect(op['description']).toBeTruthy();
      expect(op['responses']).toBeTruthy();
    }

    // The slug parameter enumerates the real corpus for function calling.
    const slugParam = (
      spec.paths['/api/v1/docs/{slug}.json'].get.parameters as Array<{
        name: string;
        required: boolean;
        schema: { enum: string[] };
      }>
    )[0];
    expect(slugParam.name).toBe('slug');
    expect(slugParam.required).toBe(true);
    expect(slugParam.schema.enum).toEqual(['features/routing', 'introduction']);

    // Error responses reference the shared Error schema.
    expect(
      spec.paths['/api/v1/docs/{slug}.json'].get.responses['404'].content[
        'application/json'
      ].schema.$ref,
    ).toBe('#/components/schemas/Error');
    expect(spec.components.schemas.Error.required).toEqual(['error']);
  });

  it('buildOpenApiSpec stays in sync with the collected corpus', () => {
    const { contentDir } = makeFixture();
    const docs = collectDocs(contentDir, ['de']);
    const spec = buildOpenApiSpec(SITE_URL, 'Analog', docs) as {
      paths: Record<
        string,
        { get: { parameters?: Array<{ schema: { enum: string[] } }> } }
      >;
    };
    expect(
      spec.paths['/docs/{slug}.md'].get.parameters?.[0].schema.enum,
    ).toEqual(docs.map((d) => d.slug));
  });
});
