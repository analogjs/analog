import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, posix } from 'node:path';
import type { Plugin } from 'vite';

const HREF_PATTERN = /\bhref="(\/[^"#]*)"/g;
const SRC_PATTERN = /\bsrc="(\/[^"#]*)"/g;

export interface BrokenLinksOptions {
  /**
   * Absolute path to the prerendered client dist directory. The plugin
   * walks every `*.html` file under here and validates internal
   * `href`/`src` references resolve to a real file.
   */
  distDir: string;
  /** Cap how many failures are printed before the "...and N more" line. */
  maxReported?: number;
}

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
  const cleaned = href.split('?')[0];
  if (/\.[a-zA-Z0-9]+$/.test(cleaned)) {
    return existsSync(resolve(distRoot, '.' + cleaned));
  }
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
 * Throws (fails the build) on any miss. External URLs and anchors are
 * ignored.
 */
export function brokenLinksPlugin(options: BrokenLinksOptions): Plugin {
  const { distDir, maxReported = 30 } = options;
  return {
    name: '@analogjs/docs:broken-links',
    apply: 'build',
    closeBundle() {
      if (!existsSync(distDir)) {
        this.warn?.('broken-links: dist not found, skipping');
        return;
      }

      const broken: { file: string; href: string }[] = [];
      for (const file of walk(distDir)) {
        const html = readFileSync(file, 'utf8');
        for (const pattern of [HREF_PATTERN, SRC_PATTERN]) {
          pattern.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = pattern.exec(html)) !== null) {
            const href = m[1];
            if (!targetExists(distDir, href)) {
              broken.push({ file: file.replace(distDir, ''), href });
            }
          }
        }
      }

      if (broken.length > 0) {
        const summary = broken
          .slice(0, maxReported)
          .map((b) => `  ${b.file}: ${b.href}`)
          .join('\n');
        const more =
          broken.length > maxReported
            ? `\n  ... and ${broken.length - maxReported} more`
            : '';
        this.error?.(
          `broken-links: ${broken.length} broken internal link(s):\n${summary}${more}`,
        );
      }
      this.info?.(`broken-links: ${broken.length} broken links`);
    },
  };
}
