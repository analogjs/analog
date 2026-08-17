import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OnLoadResult, PluginBuild } from 'esbuild';

import {
  analogContentPlugin,
  createContentFilesModule,
  discoverContentFiles,
  CONTENT_FILES_ID,
} from './analog-content-plugin';

describe('analogContentPlugin', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'analog-content-')).replace(/\\/g, '/');
    mkdirSync(join(root, 'src/content'), { recursive: true });
    mkdirSync(join(root, 'src/app/pages'), { recursive: true });
    writeFileSync(
      join(root, 'src/content/about.md'),
      '---\ntitle: About\n---\n\n# About Analog\n',
    );
    writeFileSync(join(root, 'src/app/pages/blog.md'), '# Blog\n');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('discovers markdown files in content and pages directories', () => {
    const files = discoverContentFiles(root, root);

    expect(files).toHaveLength(2);
    expect(files).toContain(`${root}/src/content/about.md`);
    expect(files).toContain(`${root}/src/app/pages/blog.md`);
  });

  it('generates list entries with front matter attributes and lazy file entries', async () => {
    const files = discoverContentFiles(root, root);
    const code = await createContentFilesModule(files, root);

    expect(code).toContain('"/src/content/about.md": {"title":"About"}');
    expect(code).toContain(
      `"/src/content/about.md": () => import('${root}/src/content/about.md').then((m) => m.default)`,
    );
  });

  it('loads markdown files as text with the body rendered to HTML', async () => {
    const hooks: {
      resolve?: [unknown, (args: unknown) => unknown];
      loads: [{ filter: RegExp; namespace?: string }, Function][];
    } = { loads: [] };
    const build = {
      onResolve: (opts: unknown, cb: never) => (hooks.resolve = [opts, cb]),
      onLoad: (opts: { filter: RegExp; namespace?: string }, cb: never) =>
        hooks.loads.push([opts, cb]),
    } as unknown as PluginBuild;

    analogContentPlugin({ workspaceRoot: root }).setup(build);

    const resolved = hooks.resolve![1]({ path: CONTENT_FILES_ID }) as {
      namespace: string;
    };
    const virtualLoad = hooks.loads.find(
      ([opts]) => opts.namespace === resolved.namespace,
    )!;
    const virtualResult = (await virtualLoad[1]({})) as OnLoadResult;
    expect(virtualResult.contents).toContain('export const contentFilesList');
    expect(virtualResult.watchDirs).toContain(`${root}/src/content`);

    const mdLoad = hooks.loads.find(
      ([opts]) => !opts.namespace && opts.filter.test('/src/content/about.md'),
    )!;
    const mdResult = (await mdLoad[1]({
      path: `${root}/src/content/about.md`,
    })) as OnLoadResult;
    expect(mdResult.loader).toBe('text');
    expect(mdResult.contents).toContain('title: About');
    expect(mdResult.contents).toContain('<h1');
  });
});
