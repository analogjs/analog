import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { collectDocs, type DocRecord } from './docs-corpus.js';

export interface AgentResourcesOptions {
  /** Public site origin, e.g. `https://analogjs.org`. No trailing slash. */
  siteUrl: string;
  /** Brand name used in generated titles/descriptions. */
  siteName: string;
  /** Absolute path to the content root. */
  contentDir: string;
  /** Absolute path to the prerendered client dist directory. */
  distDir: string;
  /** Non-default locale codes to skip (API indexes the default locale only). */
  skipLocales: ReadonlyArray<string>;
}

interface ErrorDocument {
  error: {
    code: string;
    status: number;
    message: string;
    hints: string[];
  };
}

function docSummary(siteUrl: string, d: DocRecord) {
  return {
    slug: d.slug,
    title: d.title,
    description: d.description ?? null,
    url: `${siteUrl}/docs/${d.slug}`,
    markdownUrl: `${siteUrl}/docs/${d.slug}.md`,
    jsonUrl: `${siteUrl}/api/v1/docs/${d.slug}.json`,
  };
}

export function buildNotFoundError(siteUrl: string): ErrorDocument {
  return {
    error: {
      code: 'not_found',
      status: 404,
      message: `No resource exists at this path on ${siteUrl.replace(/^https?:\/\//, '')}.`,
      hints: [
        `List every documentation page as JSON: GET ${siteUrl}/api/v1/docs.json`,
        `Fetch one page as JSON: GET ${siteUrl}/api/v1/docs/{slug}.json (slugs come from the index)`,
        `Fetch one page as raw Markdown: GET ${siteUrl}/docs/{slug}.md`,
        `Human-readable docs index for LLMs: GET ${siteUrl}/llms.txt`,
        `Full API description: GET ${siteUrl}/openapi.json`,
        `Sitemap: GET ${siteUrl}/sitemap.xml`,
      ],
    },
  };
}

export function buildOpenApiSpec(
  siteUrl: string,
  siteName: string,
  docs: DocRecord[],
): Record<string, unknown> {
  const slugs = docs.map((d) => d.slug);
  const errorResponse = (description: string) => ({
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
      },
    },
  });

  return {
    openapi: '3.1.0',
    info: {
      title: `${siteName} documentation content API`,
      version: '1.0.0',
      summary: `Read-only API over the ${siteName} (${siteUrl}) documentation.`,
      description:
        `${siteName} is the fullstack meta-framework for Angular. This API exposes the ` +
        `documentation corpus in machine-readable form: a JSON index of every page, each ` +
        `page as JSON or raw Markdown, an llms.txt index, and a sitemap. All endpoints are ` +
        `static files regenerated on every deploy — no authentication, no rate limits, ` +
        `GET-only. Errors are returned as structured JSON (see the Error schema).`,
      contact: {
        name: `${siteName} team`,
        url: 'https://github.com/analogjs/analog/issues',
        email: 'brandon@analogjs.org',
      },
      license: {
        name: 'MIT',
        identifier: 'MIT',
      },
    },
    servers: [{ url: siteUrl, description: `${siteName} production site` }],
    paths: {
      '/openapi.json': {
        get: {
          operationId: 'getOpenApiSpec',
          summary: 'This OpenAPI document',
          description:
            'Returns this OpenAPI 3.1 description of every machine-readable endpoint on the site.',
          responses: {
            '200': {
              description: 'The OpenAPI document.',
              content: {
                'application/json': { schema: { type: 'object' } },
              },
            },
          },
        },
      },
      '/api/v1/docs.json': {
        get: {
          operationId: 'listDocs',
          summary: 'List all documentation pages',
          description:
            'Returns an index of every English documentation page with its title, description, and the URLs of its HTML, Markdown, and JSON representations.',
          responses: {
            '200': {
              description: 'The documentation index.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DocsIndex' },
                },
              },
            },
          },
        },
      },
      '/api/v1/docs/{slug}.json': {
        get: {
          operationId: 'getDoc',
          summary: 'Get one documentation page as JSON',
          description:
            'Returns a single documentation page: metadata plus the full Markdown source in the `content` field. Slugs may contain `/` segments (e.g. `features/routing/overview`); take them verbatim from the listDocs index.',
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              description:
                'Page slug from the listDocs index. May contain `/` segments, used literally in the URL path.',
              schema: { type: 'string', enum: slugs },
            },
          ],
          responses: {
            '200': {
              description: 'The documentation page.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Doc' },
                },
              },
            },
            '404': errorResponse('No page exists for this slug.'),
          },
        },
      },
      '/docs/{slug}.md': {
        get: {
          operationId: 'getDocMarkdown',
          summary: 'Get one documentation page as raw Markdown',
          description:
            'Returns the raw Markdown source of a documentation page. The same content is served from the extension-less `/docs/{slug}` URL when the request sends `Accept: text/markdown`.',
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              description:
                'Page slug from the listDocs index. May contain `/` segments, used literally in the URL path.',
              schema: { type: 'string', enum: slugs },
            },
          ],
          responses: {
            '200': {
              description: 'The raw Markdown source.',
              content: {
                'text/markdown': { schema: { type: 'string' } },
              },
            },
            '404': {
              description: 'No page exists for this slug.',
              content: {
                'text/markdown': { schema: { type: 'string' } },
              },
            },
          },
        },
      },
      '/llms.txt': {
        get: {
          operationId: 'getLlmsIndex',
          summary: 'llms.txt index of the documentation',
          description:
            'Markdown index of every documentation page (llmstxt.org convention), including when-to-use guidance for agents.',
          responses: {
            '200': {
              description: 'The llms.txt index.',
              content: {
                'text/plain': { schema: { type: 'string' } },
              },
            },
          },
        },
      },
      '/llms-full.txt': {
        get: {
          operationId: 'getLlmsFull',
          summary: 'Full documentation corpus as one Markdown file',
          description:
            'Every English documentation page concatenated into a single Markdown document, for one-shot ingestion.',
          responses: {
            '200': {
              description: 'The concatenated Markdown corpus.',
              content: {
                'text/plain': { schema: { type: 'string' } },
              },
            },
          },
        },
      },
      '/sitemap.xml': {
        get: {
          operationId: 'getSitemap',
          summary: 'Sitemap of every page on the site',
          description:
            'XML sitemap of every published page, including locale alternates.',
          responses: {
            '200': {
              description: 'The sitemap.',
              content: {
                'application/xml': { schema: { type: 'string' } },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        DocsIndex: {
          type: 'object',
          description: 'Index of every English documentation page.',
          required: ['name', 'description', 'count', 'docs'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            count: {
              type: 'integer',
              description: 'Number of entries in `docs`.',
            },
            docs: {
              type: 'array',
              items: { $ref: '#/components/schemas/DocSummary' },
            },
          },
        },
        DocSummary: {
          type: 'object',
          description: 'One documentation page and its representations.',
          required: ['slug', 'title', 'url', 'markdownUrl', 'jsonUrl'],
          properties: {
            slug: { type: 'string', description: 'Stable page identifier.' },
            title: { type: 'string' },
            description: { type: ['string', 'null'] },
            url: {
              type: 'string',
              format: 'uri',
              description: 'HTML representation.',
            },
            markdownUrl: {
              type: 'string',
              format: 'uri',
              description: 'Raw Markdown representation.',
            },
            jsonUrl: {
              type: 'string',
              format: 'uri',
              description: 'JSON representation (getDoc).',
            },
          },
        },
        Doc: {
          type: 'object',
          description:
            'A documentation page with its full Markdown source in `content`.',
          required: ['slug', 'title', 'url', 'markdownUrl', 'content'],
          properties: {
            slug: { type: 'string' },
            title: { type: 'string' },
            description: { type: ['string', 'null'] },
            url: { type: 'string', format: 'uri' },
            markdownUrl: { type: 'string', format: 'uri' },
            content: {
              type: 'string',
              description: 'Full Markdown source of the page.',
            },
          },
        },
        Error: {
          type: 'object',
          description: 'Structured error document returned for API misses.',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'status', 'message', 'hints'],
              properties: {
                code: {
                  type: 'string',
                  description: 'Machine-readable error code, e.g. `not_found`.',
                },
                status: {
                  type: 'integer',
                  description: 'HTTP status code of the response.',
                },
                message: { type: 'string' },
                hints: {
                  type: 'array',
                  description: 'Concrete next requests an agent can make.',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  };
}

/**
 * Emits the machine-readable agent surface next to the prerendered site:
 *
 *   - openapi.json               OpenAPI 3.1 description of every endpoint
 *   - api/v1/docs.json           JSON index of the default-locale docs
 *   - api/v1/docs/<slug>.json    one JSON document per docs page
 *   - api/v1/errors/404.json     structured JSON error body (served by nginx
 *                                for /api/* misses via `error_page`)
 */
export function agentResourcesPlugin(options: AgentResourcesOptions): Plugin {
  const { siteUrl, siteName, contentDir, distDir, skipLocales } = options;

  return {
    name: '@analogjs/content:agent-resources',
    apply: 'build',
    closeBundle() {
      const docs = collectDocs(contentDir, skipLocales);

      const writeJson = (relPath: string, data: unknown) => {
        const outPath = resolve(distDir, relPath);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      };

      writeJson('openapi.json', buildOpenApiSpec(siteUrl, siteName, docs));

      writeJson('api/v1/docs.json', {
        name: `${siteName} documentation index`,
        description: `Every English documentation page on ${siteUrl}, with HTML, Markdown, and JSON representations. See ${siteUrl}/openapi.json for the full API description.`,
        count: docs.length,
        docs: docs.map((d) => docSummary(siteUrl, d)),
      });

      for (const d of docs) {
        writeJson(`api/v1/docs/${d.slug}.json`, {
          slug: d.slug,
          title: d.title,
          description: d.description ?? null,
          url: `${siteUrl}/docs/${d.slug}`,
          markdownUrl: `${siteUrl}/docs/${d.slug}.md`,
          content: d.body.trim() + '\n',
        });
      }

      writeJson('api/v1/errors/404.json', buildNotFoundError(siteUrl));

      this.info?.(
        `agent resources: openapi.json + ${docs.length} doc JSON files`,
      );
    },
  };
}
