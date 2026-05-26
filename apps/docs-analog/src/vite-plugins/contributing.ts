import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Copies the repo-root CONTRIBUTING.md into
 * src/content/contributing.md at dev-server startup and at build time
 * so the docs site stays in sync without manual sync. The destination
 * is committed to the repo as a placeholder, but the canonical copy is
 * the root file — edit that one.
 */
export function contributingCopyPlugin(): Plugin {
  const sync = () => {
    const src = resolve(__dirname, '../../../../CONTRIBUTING.md');
    const dst = resolve(__dirname, '../content/contributing.md');
    const body = readFileSync(src, 'utf8');
    writeFileSync(dst, `---\ntitle: Contributing\n---\n\n${body}`, 'utf8');
  };
  return {
    name: 'docs-analog:contributing-copy',
    buildStart() {
      sync();
    },
    configureServer() {
      sync();
    },
  };
}
