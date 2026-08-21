import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

export interface DocRecord {
  /** Slug relative to the content root, no extension (e.g. `features/routing/overview`). */
  slug: string;
  title: string;
  description?: string;
  /** Markdown body with the frontmatter stripped. */
  body: string;
}

export function walkMarkdown(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkMarkdown(full, out);
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

export function stripFrontmatter(text: string): {
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
 * Walks the content root and returns every default-locale doc, sorted by
 * slug. Docs under a locale prefix listed in `skipLocales` are excluded.
 */
export function collectDocs(
  contentDir: string,
  skipLocales: ReadonlyArray<string>,
): DocRecord[] {
  const skip = new Set<string>(skipLocales);
  const docs: DocRecord[] = [];
  for (const file of walkMarkdown(contentDir)) {
    const rel = relative(contentDir, file).replace(/\.md$/, '');
    const parts = rel.split('/');
    if (skip.has(parts[0])) continue;
    const raw = readFileSync(file, 'utf8');
    const { body, title, description } = stripFrontmatter(raw);
    docs.push({ slug: rel, title: title ?? rel, description, body });
  }
  docs.sort((a, b) => a.slug.localeCompare(b.slug));
  return docs;
}
