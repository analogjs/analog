import type { Plugin } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

import type { MarkedContentHighlighter } from '../content/marked/marked-content-highlighter.js';
import { setupDiscoveryManifest } from './discovery-manifest.js';

/**
 * Module specifier applications import to receive the discovered
 * content files:
 *
 *   import { contentFilesList, contentFiles } from 'analog:content-files';
 *
 * Both maps are passed to `provideContentFiles({ list, files })`.
 */
export const CONTENT_FILES_ID = 'analog:content-files';

const CONTENT_FILES_NAMESPACE = 'analog-content-files';

export interface AnalogContentPluginOptions {
  /**
   * Workspace root. Defaults to process.cwd().
   */
  workspaceRoot?: string;
  /**
   * Project root containing the app source, relative to or resolved
   * against the workspace root. Defaults to the workspace root.
   */
  projectRoot?: string;
  /**
   * Additional directories relative to the workspace root
   * to scan for content files.
   */
  additionalContentDirs?: string[];
  /**
   * Syntax highlighter used when rendering markdown at build time.
   * Defaults to 'shiki'.
   */
  highlighter?: 'shiki' | 'prism';
  /**
   * Emit mermaid code fences as `<pre class="mermaid">` blocks instead
   * of highlighting them, for client-side rendering through
   * `withMarkdownRenderer({ loadMermaid })`. Only meaningful with the
   * shiki highlighter — the prism path always passes mermaid through.
   */
  mermaid?: boolean;
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

export function contentDirs(
  root: string,
  workspaceRoot: string,
  additionalContentDirs?: string[],
): string[] {
  return [
    `${root}/src/app/routes`,
    `${root}/src/app/pages`,
    `${root}/src/content`,
    ...(additionalContentDirs || []).map((dir) => `${workspaceRoot}${dir}`),
  ];
}

/**
 * Discovers markdown content files using the same globs as the Vite
 * router plugin's content discovery.
 */
export function discoverContentFiles(
  root: string,
  workspaceRoot: string,
  additionalContentDirs?: string[],
): string[] {
  return globSync(
    contentDirs(root, workspaceRoot, additionalContentDirs).map(
      (dir) => `${dir}/**/*.md`,
    ),
    { dot: true, absolute: true },
  ).map(normalizeSlashes);
}

/**
 * Generates the virtual module source for content files. The list map
 * holds front matter attributes parsed at build time (the equivalent of
 * the Vite `?analog-content-list=true` transform), and the files map
 * holds lazy imports of the content (the equivalent of
 * `?analog-content-file=true`).
 */
export async function createContentFilesModule(
  contentFiles: string[],
  root: string,
): Promise<string> {
  const fm: any = await import('front-matter');
  const frontmatter = fm.default || fm;

  const listEntries: string[] = [];
  const fileEntries: string[] = [];

  for (const file of contentFiles) {
    const key = file.startsWith(root) ? file.replace(root, '') : file;
    const { attributes } = frontmatter(readFileSync(file, 'utf8'));
    listEntries.push(`  "${key}": ${JSON.stringify(attributes)}`);
    fileEntries.push(
      `  "${key}": () => import('${file}').then((m) => m.default)`,
    );
  }

  return (
    `export const contentFilesList = {\n${listEntries.join(',\n')}\n};\n\n` +
    `export const contentFiles = {\n${fileEntries.join(',\n')}\n};\n`
  );
}

async function createHighlighter(
  highlighter: 'shiki' | 'prism',
  mermaid?: boolean,
): Promise<MarkedContentHighlighter> {
  if (highlighter === 'shiki') {
    const { getShikiHighlighter } = await import('../content/shiki/index.js');
    // getShikiHighlighter caches a singleton, so the first call decides
    // mermaid support for the process.
    return getShikiHighlighter(
      mermaid ? { highlighter: { additionalLangs: ['mermaid'] } } : {},
    );
  }

  const { getPrismHighlighter } = await import('../content/prism/index.js');
  const loadLanguages = await import('prismjs/components/index.js');
  (loadLanguages as unknown as { default: Function }).default([
    'bash',
    'css',
    'javascript',
    'json',
    'markup',
    'typescript',
  ]);

  return getPrismHighlighter();
}

/**
 * Renders a markdown file the same way as the Vite
 * `?analog-content-file=true` transform: front matter is preserved and
 * the body is rendered to HTML at build time.
 *
 * Renders are serialized: the browser and server bundles build
 * concurrently, and the marked setup is a singleton whose heading-id
 * slugger keeps module-level state — an interleaved reset and parse
 * would give the same file different heading ids in each bundle.
 */
export function renderContentFile(
  path: string,
  highlighter: MarkedContentHighlighter,
): Promise<string> {
  const result = renderQueue.then(() =>
    renderContentFileUnlocked(path, highlighter),
  );
  renderQueue = result.catch(() => undefined);
  return result;
}

let renderQueue: Promise<unknown> = Promise.resolve();

async function renderContentFileUnlocked(
  path: string,
  highlighter: MarkedContentHighlighter,
): Promise<string> {
  const fm: any = await import('front-matter');
  const frontmatterFn = fm.default || fm;
  const { body, frontmatter } = frontmatterFn(readFileSync(path, 'utf8'));

  const { getMarkedSetup } = await import('../content/marked/index.js');
  const markedSetup = getMarkedSetup({ mangle: true }, highlighter);

  const { resetHeadings } = await import('marked-gfm-heading-id');
  resetHeadings();

  const mdContent = (await markedSetup
    .getMarkedInstance()
    .parse(body)) as unknown as string;

  return `---\n${frontmatter}\n---\n\n${mdContent}`;
}

/**
 * Esbuild plugin that resolves the `analog:content-files` virtual
 * module to the content list (front matter attributes) and content
 * files (lazy raw content) maps, and loads `.md` files as text with the
 * markdown body pre-rendered to HTML at build time.
 */
export function analogContentPlugin(
  options?: AnalogContentPluginOptions,
): Plugin {
  const workspaceRoot = normalizeSlashes(
    options?.workspaceRoot ?? process.cwd(),
  );
  const root = normalizeSlashes(
    resolve(workspaceRoot, options?.projectRoot ?? '.'),
  );
  let markedHighlighter: Promise<MarkedContentHighlighter> | undefined;

  return {
    name: 'analog-content',
    setup(build) {
      // Not under a dot-directory: the Angular watcher ignores those.
      const manifestImport = setupDiscoveryManifest(
        `${workspaceRoot}/node_modules/@analogjs/esbuild-manifests/content-files.json`,
        contentDirs(root, workspaceRoot, options?.additionalContentDirs),
        () =>
          discoverContentFiles(
            root,
            workspaceRoot,
            options?.additionalContentDirs,
          ),
      );

      build.onResolve({ filter: /^analog:content-files$/ }, () => ({
        path: CONTENT_FILES_ID,
        namespace: CONTENT_FILES_NAMESPACE,
      }));

      build.onLoad(
        { filter: /.*/, namespace: CONTENT_FILES_NAMESPACE },
        async () => {
          const contentFiles = discoverContentFiles(
            root,
            workspaceRoot,
            options?.additionalContentDirs,
          );

          return {
            // The manifest import makes content discovery a watchable
            // build input, so adding or removing content rebuilds.
            contents:
              manifestImport +
              (await createContentFilesModule(contentFiles, root)),
            loader: 'js',
            resolveDir: root,
            // For esbuild's native watch mode.
            watchDirs: contentDirs(
              root,
              workspaceRoot,
              options?.additionalContentDirs,
            ).filter((dir) => existsSync(dir)),
          };
        },
      );

      build.onLoad({ filter: /\.md$/ }, async (args) => {
        markedHighlighter ??= createHighlighter(
          options?.highlighter ?? 'shiki',
          options?.mermaid,
        );

        return {
          contents: await renderContentFile(args.path, await markedHighlighter),
          loader: 'text',
        };
      });
    },
  };
}
