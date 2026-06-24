import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { Plugin } from 'vite';

export interface LlmsTxtOptions {
  /** Public site origin, e.g. `https://analogjs.org`. No trailing slash. */
  siteUrl: string;
  /** Brand name written as the top-level heading in `llms.txt`. */
  siteName: string;
  /** Absolute path to the content root. */
  contentDir: string;
  /** Absolute path to the prerendered client dist directory. */
  distDir: string;
  /**
   * Non-default locale codes to SKIP. llms.txt convention indexes the
   * default locale only; translated docs are filtered out by matching
   * any of these prefixes on the slug.
   */
  skipLocales: ReadonlyArray<string>;
}

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
 * Emits two files at the dist root:
 *
 *   - llms.txt       index of all default-locale doc titles + URLs
 *   - llms-full.txt  concatenated default-locale markdown bodies,
 *                    each prefixed by its title + URL
 *
 * Translated docs are excluded (per the llms.txt convention).
 */
export function llmsTxtPlugin(options: LlmsTxtOptions): Plugin {
  const { siteUrl, siteName, contentDir, distDir, skipLocales } = options;
  const skip = new Set<string>(skipLocales);

  return {
    name: '@analogjs/content/docs:llms-txt',
    apply: 'build',
    closeBundle() {
      const docs: {
        slug: string;
        title: string;
        description?: string;
        body: string;
      }[] = [];
      for (const file of walk(contentDir)) {
        const rel = relative(contentDir, file).replace(/\.md$/, '');
        const parts = rel.split('/');
        if (skip.has(parts[0])) continue;
        const raw = readFileSync(file, 'utf8');
        const { body, title, description } = stripFrontmatter(raw);
        docs.push({
          slug: rel,
          title: title ?? rel,
          description,
          body,
        });
      }

      docs.sort((a, b) => a.slug.localeCompare(b.slug));

      const indexEntries = docs
        .map(
          (d) =>
            `- [${d.title}](${siteUrl}/docs/${d.slug}): ${d.description ?? d.title}`,
        )
        .join('\n');
      const llmsTxt = `# ${siteName}\n\n## Docs\n\n${indexEntries}\n`;
      writeFileSync(resolve(distDir, 'llms.txt'), llmsTxt, 'utf8');

      const fullEntries = docs
        .map(
          (d) =>
            `# ${d.title}\n\nURL: ${siteUrl}/docs/${d.slug}\n\n${d.body.trim()}`,
        )
        .join('\n---\n\n');
      writeFileSync(resolve(distDir, 'llms-full.txt'), fullEntries, 'utf8');

      this.info?.(`llms.txt: indexed ${docs.length} docs`);
    },
  };
}
