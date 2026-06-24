import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Plugin } from 'vite';

export interface CopyMarkdownEntry {
  /** Absolute path to the source markdown file. */
  src: string;
  /** Absolute path where the file is written. Parent dirs are created. */
  dst: string;
  /** When set, prepends `---\ntitle: <title>\n---\n\n` to the body. */
  frontmatterTitle?: string;
}

export interface CopyMarkdownOptions {
  /** One or more files to copy at dev-server startup and at build time. */
  entries: ReadonlyArray<CopyMarkdownEntry>;
}

/**
 * Copies markdown files from arbitrary source paths into the docs site's
 * content tree at dev-server startup and at build time, so docs stay in
 * sync with a canonical source (e.g. a repo-root CONTRIBUTING.md or a
 * package README) without manual sync.
 */
export function copyMarkdownPlugin(options: CopyMarkdownOptions): Plugin {
  const sync = () => {
    for (const entry of options.entries) {
      const body = readFileSync(entry.src, 'utf8');
      const out = entry.frontmatterTitle
        ? `---\ntitle: ${entry.frontmatterTitle}\n---\n\n${body}`
        : body;
      mkdirSync(dirname(entry.dst), { recursive: true });
      writeFileSync(entry.dst, out, 'utf8');
    }
  };
  return {
    name: '@analogjs/content/docs:copy-markdown',
    buildStart() {
      sync();
    },
    configureServer() {
      sync();
    },
  };
}
