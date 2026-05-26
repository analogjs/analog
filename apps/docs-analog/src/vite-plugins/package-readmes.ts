import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

interface ReadmeMapping {
  /** Path under /packages relative to repo root, e.g. 'astro-angular/README.md'. */
  src: string;
  /** Destination under apps/docs-analog/src/content/packages/. */
  dst: string;
  /** Page title written into frontmatter (matches the sidebar label). */
  title: string;
}

const MAPPINGS: ReadmeMapping[] = [
  {
    src: 'astro-angular/README.md',
    dst: 'astro-angular/overview.md',
    title: 'Astro',
  },
  { src: 'router/README.md', dst: 'router/overview.md', title: 'Router' },
  {
    src: 'vite-plugin-angular/README.md',
    dst: 'vite-plugin-angular/overview.md',
    title: 'Vite',
  },
  {
    src: 'vite-plugin-nitro/README.md',
    dst: 'vite-plugin-nitro/overview.md',
    title: 'Nitro',
  },
];

/**
 * Copies each package's README into src/content/packages/<pkg>/overview.md
 * at dev-server start and at build time so the package docs pages stay
 * in sync with the canonical README. Editing the destination is a
 * no-op — the next dev start overwrites it. Frontmatter title is
 * injected to match the sidebar label.
 */
export function packageReadmesPlugin(): Plugin {
  const sync = () => {
    const repoRoot = resolve(__dirname, '../../../..');
    const contentRoot = resolve(__dirname, '../content/packages');
    for (const m of MAPPINGS) {
      const srcPath = resolve(repoRoot, 'packages', m.src);
      const dstPath = resolve(contentRoot, m.dst);
      const body = readFileSync(srcPath, 'utf8');
      mkdirSync(dirname(dstPath), { recursive: true });
      writeFileSync(dstPath, `---\ntitle: ${m.title}\n---\n\n${body}`, 'utf8');
    }
  };
  return {
    name: 'docs-analog:package-readmes',
    buildStart() {
      sync();
    },
    configureServer() {
      sync();
    },
  };
}
