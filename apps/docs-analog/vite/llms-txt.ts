import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { collectDocs } from './docs-corpus.js';

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
  /**
   * Markdown inserted between the `# <siteName>` heading and the `## Docs`
   * index — the llms.txt summary blockquote plus agent-facing sections
   * (what the project is, when to use it, how to consume this site).
   */
  preamble?: string;
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
  const { siteUrl, siteName, contentDir, distDir, skipLocales, preamble } =
    options;

  return {
    name: '@analogjs/content:llms-txt',
    apply: 'build',
    closeBundle() {
      const docs = collectDocs(contentDir, skipLocales);

      const indexEntries = docs
        .map(
          (d) =>
            `- [${d.title}](${siteUrl}/docs/${d.slug}): ${d.description ?? d.title}`,
        )
        .join('\n');
      const header = preamble
        ? `# ${siteName}\n\n${preamble.trim()}\n`
        : `# ${siteName}\n`;
      const llmsTxt = `${header}\n## Docs\n\n${indexEntries}\n`;
      writeFileSync(resolve(distDir, 'llms.txt'), llmsTxt, 'utf8');

      const fullEntries = docs
        .map(
          (d) =>
            `# ${d.title}\n\nURL: ${siteUrl}/docs/${d.slug}\n\n${d.body.trim()}`,
        )
        .join('\n---\n\n');
      writeFileSync(resolve(distDir, 'llms-full.txt'), fullEntries, 'utf8');

      // Section-scoped indexes: one llms.txt per multi-page top-level section
      // (e.g. /docs/features/llms.txt) so a retrieval pipeline can pull just
      // the relevant section instead of the whole corpus.
      const sections = new Map<string, typeof docs>();
      for (const doc of docs) {
        const section = doc.slug.split('/')[0];
        const group = sections.get(section);
        if (group) group.push(doc);
        else sections.set(section, [doc]);
      }

      let sectionCount = 0;
      for (const [section, sectionDocs] of sections) {
        if (sectionDocs.length < 2) continue;
        const entries = sectionDocs
          .map(
            (d) =>
              `- [${d.title}](${siteUrl}/docs/${d.slug}): ${d.description ?? d.title}`,
          )
          .join('\n');
        const sectionTxt = `# ${siteName}\n\n## ${section}\n\n${entries}\n`;
        const outPath = resolve(distDir, 'docs', section, 'llms.txt');
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, sectionTxt, 'utf8');
        sectionCount++;
      }

      this.info?.(
        `llms.txt: indexed ${docs.length} docs, ${sectionCount} section indexes`,
      );
    },
  };
}
