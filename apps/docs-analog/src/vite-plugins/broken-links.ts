import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, posix } from 'node:path';
import type { Plugin } from 'vite';

const HREF_PATTERN = /\bhref="(\/[^"#]*)"/g;
const SRC_PATTERN = /\bsrc="(\/[^"#]*)"/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

function targetExists(distRoot: string, href: string): boolean {
  // Strip query/hash, normalize trailing slash
  const cleaned = href.split('?')[0];
  // Asset files (with extension)
  if (/\.[a-zA-Z0-9]+$/.test(cleaned)) {
    return existsSync(resolve(distRoot, '.' + cleaned));
  }
  // HTML routes — try /foo, /foo/index.html, /foo.html
  const candidates = [
    posix.join(cleaned, 'index.html'),
    cleaned + '.html',
    cleaned,
  ];
  return candidates.some((c) => existsSync(resolve(distRoot, '.' + c)));
}

/**
 * Walks every prerendered HTML file in the build output and validates
 * that all internal href/src attributes resolve to a file that exists.
 * Throws (fails the build) on any miss — parity with Docusaurus's
 * onBrokenLinks: 'throw'.
 *
 * External URLs and anchors are ignored. Mail/tel links are ignored.
 */
export function brokenLinksPlugin(): Plugin {
  return {
    name: 'docs-analog:broken-links',
    apply: 'build',
    closeBundle() {
      const distRoot = resolve(
        __dirname,
        '../../../../dist/apps/docs-analog/client',
      );
      if (!existsSync(distRoot)) {
        this.warn?.('broken-links: dist not found, skipping');
        return;
      }

      const broken: { file: string; href: string }[] = [];
      for (const file of walk(distRoot)) {
        const html = readFileSync(file, 'utf8');
        for (const pattern of [HREF_PATTERN, SRC_PATTERN]) {
          pattern.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = pattern.exec(html)) !== null) {
            const href = m[1];
            if (!targetExists(distRoot, href)) {
              broken.push({ file: file.replace(distRoot, ''), href });
            }
          }
        }
      }

      if (broken.length > 0) {
        const summary = broken
          .slice(0, 30)
          .map((b) => `  ${b.file}: ${b.href}`)
          .join('\n');
        const more =
          broken.length > 30 ? `\n  ... and ${broken.length - 30} more` : '';
        this.error?.(
          `broken-links: ${broken.length} broken internal link(s):\n${summary}${more}`,
        );
      }
      this.info?.(`broken-links: ${broken.length} broken links`);
    },
  };
}
