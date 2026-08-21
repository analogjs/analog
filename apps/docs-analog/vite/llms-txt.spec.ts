import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { llmsTxtPlugin } from './llms-txt';

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'llms-txt-'));
  const contentDir = join(root, 'content');
  const distDir = join(root, 'dist');
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });
  writeFileSync(
    join(contentDir, 'introduction.md'),
    '---\ntitle: Introduction\ndescription: What Analog is\n---\n\n# Introduction\n\nBody.\n',
  );
  return { contentDir, distDir };
}

function runPlugin(
  contentDir: string,
  distDir: string,
  preamble?: string,
): string {
  const plugin = llmsTxtPlugin({
    siteUrl: 'https://example.test',
    siteName: 'Analog',
    contentDir,
    distDir,
    skipLocales: [],
    preamble,
  });
  const closeBundle = plugin.closeBundle as () => void;
  closeBundle.call({ info: () => undefined });
  return readFileSync(resolve(distDir, 'llms.txt'), 'utf8');
}

describe('llmsTxtPlugin preamble', () => {
  it('inserts the preamble between the heading and the docs index', () => {
    const { contentDir, distDir } = makeFixture();
    const out = runPlugin(
      contentDir,
      distDir,
      '> Summary line.\n\n## When to use Analog\n\n- Angular apps.',
    );
    const headingAt = out.indexOf('# Analog');
    const preambleAt = out.indexOf('## When to use Analog');
    const docsAt = out.indexOf('## Docs');
    expect(headingAt).toBe(0);
    expect(preambleAt).toBeGreaterThan(headingAt);
    expect(docsAt).toBeGreaterThan(preambleAt);
    expect(out).toContain(
      '- [Introduction](https://example.test/docs/introduction): What Analog is',
    );
  });

  it('keeps the plain heading when no preamble is configured', () => {
    const { contentDir, distDir } = makeFixture();
    const out = runPlugin(contentDir, distDir);
    expect(out.startsWith('# Analog\n\n## Docs\n')).toBe(true);
  });
});
