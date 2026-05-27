import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { Plugin } from 'vite';

const SITE_URL = 'https://analogjs.org';
const SUPPORTED_LOCALES = new Set(['de', 'es', 'pt-br', 'zh-hans']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

function stripFrontmatter(text: string): {
  body: string;
  title?: string;
  description?: string;
} {
  let body = text;
  let title: string | undefined;
  let description: string | undefined;
  const m = /^---\n([\s\S]*?)\n---\n+/.exec(body);
  if (m) {
    for (const line of m[1].split('\n')) {
      const t = /^title:\s*(.+)$/.exec(line);
      const d = /^description:\s*(.+)$/.exec(line);
      if (t) title = t[1].trim().replace(/^['"]|['"]$/g, '');
      if (d) description = d[1].trim().replace(/^['"]|['"]$/g, '');
    }
    body = body.slice(m[0].length);
  }
  if (!title) {
    const h1 = /^#\s+(.+)$/m.exec(body);
    if (h1) title = h1[1].trim();
  }
  return { body, title, description };
}

/**
 * Emits two files at the dist root, matching the existing
 * apps/docs-app docusaurus.config.js llms-txt-plugin output:
 *
 *   - llms.txt       index of all English doc titles with URLs
 *   - llms-full.txt  concatenated EN markdown bodies, each prefixed
 *                    by its title + URL
 *
 * Translated docs are not included (per Phase 4-5 layout the canonical
 * URL set is English-only at /docs/, locales mirror at /<locale>/docs/
 * but llms.txt convention indexes the default locale only).
 */
export function llmsTxtPlugin(): Plugin {
  return {
    name: 'docs-analog:llms-txt',
    apply: 'build',
    closeBundle() {
      const contentDir = resolve(__dirname, '../content');
      const outDir = resolve(
        __dirname,
        '../../../../dist/apps/docs-analog/client',
      );

      const enDocs: {
        slug: string;
        title: string;
        description?: string;
        body: string;
      }[] = [];
      for (const file of walk(contentDir)) {
        const rel = relative(contentDir, file).replace(/\.md$/, '');
        const parts = rel.split('/');
        if (SUPPORTED_LOCALES.has(parts[0])) continue;
        const raw = readFileSync(file, 'utf8');
        const { body, title, description } = stripFrontmatter(raw);
        enDocs.push({
          slug: rel,
          title: title ?? rel,
          description,
          body,
        });
      }

      enDocs.sort((a, b) => a.slug.localeCompare(b.slug));

      const indexEntries = enDocs
        .map(
          (d) =>
            `- [${d.title}](${SITE_URL}/docs/${d.slug}): ${d.description ?? d.title}`,
        )
        .join('\n');
      const llmsTxt = `# Analog\n\n## Docs\n\n${indexEntries}\n`;
      writeFileSync(resolve(outDir, 'llms.txt'), llmsTxt, 'utf8');

      const fullEntries = enDocs
        .map(
          (d) =>
            `# ${d.title}\n\nURL: ${SITE_URL}/docs/${d.slug}\n\n${d.body.trim()}`,
        )
        .join('\n---\n\n');
      writeFileSync(resolve(outDir, 'llms-full.txt'), fullEntries, 'utf8');

      this.info?.(`llms.txt: indexed ${enDocs.length} EN docs`);
    },
  };
}
