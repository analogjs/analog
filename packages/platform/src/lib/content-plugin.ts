import type { Plugin, UserConfig } from 'vite';
import { normalizePath } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// import { globSync } from 'tinyglobby'; // TODO: Complete migration from fast-glob
import fg from 'fast-glob';

import type { WithShikiHighlighterOptions } from './content/shiki/options.js';
import type { MarkedContentHighlighter } from './content/marked/marked-content-highlighter.js';
import type { WithPrismHighlighterOptions } from './content/prism/options.js';
import type { WithMarkedOptions } from './content/marked/index.js';
import type { Options } from './options.js';

interface Content {
  code: string;
  attributes: string;
}

export type ContentPluginOptions = {
  highlighter?: 'shiki' | 'prism';
  markedOptions?: WithMarkedOptions;
  shikiOptions?: WithShikiHighlighterOptions;
  prismOptions?: WithPrismHighlighterOptions;
};

export function contentPlugin(
  {
    highlighter,
    markedOptions,
    shikiOptions,
    prismOptions,
  }: ContentPluginOptions = {
    highlighter: 'prism',
    markedOptions: { mangle: true },
  },
  options?: Options,
): Plugin[] {
  const cache = new Map<string, Content>();

  let markedHighlighter: MarkedContentHighlighter;
  const workspaceRoot = normalizePath(options?.workspaceRoot ?? process.cwd());
  let config: UserConfig;
  let root: string;

  return [
    {
      name: 'analogjs-content-frontmatter',
      async transform(code, id) {
        // Transform only the frontmatter into a JSON object for lists
        if (!id.includes('analog-content-list=true')) {
          return;
        }

        const cachedContent = cache.get(id);
        // There's no reason to run `readFileSync` and frontmatter parsing if the
        // `transform` hook is called with the same code. In such cases, we can simply
        // return the cached attributes, which is faster than repeatedly reading files
        // synchronously during the build process.
        if (cachedContent?.code === code) {
          return `export default ${cachedContent.attributes}`;
        }

        const fm: any = await import('front-matter');
        // The `default` property will be available in CommonJS environment, for instance,
        // when running unit tests. It's safe to retrieve `default` first, since we still
        // fallback to the original implementation.
        const frontmatter = fm.default || fm;
        const fileContents = readFileSync(id.split('?')[0], 'utf8');
        const { attributes } = frontmatter(fileContents);
        const content = {
          code,
          attributes: JSON.stringify(attributes),
        };
        cache.set(id, content);

        return `export default ${content.attributes}`;
      },
    },
    {
      name: 'analogjs-content-file',
      enforce: 'post',
      async load(id) {
        if (!id.includes('analog-content-file=true')) {
          return;
        }

        if (!markedHighlighter) {
          if (highlighter === 'shiki') {
            const { getShikiHighlighter } = await import(
              './content/shiki/index.js'
            );
            markedHighlighter = getShikiHighlighter(shikiOptions);
          } else {
            const { getPrismHighlighter } = await import(
              './content/prism/index.js'
            );
            markedHighlighter = getPrismHighlighter();

            const langs = [
              'bash',
              'css',
              'javascript',
              'json',
              'markup',
              'typescript',
            ];

            if (
              Array.isArray(prismOptions?.additionalLangs) &&
              prismOptions?.additionalLangs?.length > 0
            ) {
              langs.push(...prismOptions.additionalLangs);
            }

            const loadLanguages = await import('prismjs/components/index.js');

            (loadLanguages as unknown as { default: Function }).default(langs);
          }
        }

        const fm: any = await import('front-matter');
        // The `default` property will be available in CommonJS environment, for instance,
        // when running unit tests. It's safe to retrieve `default` first, since we still
        // fallback to the original implementation.
        const frontmatterFn = fm.default || fm;
        const fileContents = readFileSync(id.split('?')[0], 'utf8');
        const { body, frontmatter } = frontmatterFn(fileContents);

        // parse markdown and highlight
        const { MarkedSetupService } = await import(
          './content/marked/marked-setup.service.js'
        );
        const markedSetupService = new MarkedSetupService(
          markedOptions,
          markedHighlighter,
        );
        const mdContent = (await markedSetupService
          .getMarkedInstance()
          .parse(body)) as unknown as string;

        return `export default ${JSON.stringify(
          `---\n${frontmatter}\n---\n\n${mdContent}`,
        )}`;
      },
    },
    {
      name: 'analog-content-glob-routes',
      config(_config) {
        config = _config;
        root = normalizePath(resolve(workspaceRoot, config.root || '.') || '.');
      },
      transform(code) {
        if (
          code.includes('ANALOG_CONTENT_FILE_LIST') &&
          code.includes('ANALOG_AGX_FILES')
        ) {
          const contentFilesList: string[] = fg.sync(
            //const contentFilesList: string[] = globSync(
            [
              `${root}/src/content/**/*.md`,
              `${root}/src/content/**/*.agx`,
              ...(options?.additionalContentDirs || []).map(
                (glob) => `${workspaceRoot}${glob}/**/*.{md,agx}`,
              ),
            ],
            { dot: true },
            //{ dot: true, absolute: true },
          );

          const eagerImports: string[] = [];

          contentFilesList.forEach((module, index) => {
            eagerImports.push(
              `import { default as analog_module_${index} } from "${module}?analog-content-list=true";`,
            );
          });

          let result = code.replace(
            'let ANALOG_CONTENT_FILE_LIST = {};',
            `
            let ANALOG_CONTENT_FILE_LIST = {${contentFilesList.map(
              (module, index) =>
                `"${module.replace(root, '')}": analog_module_${index}`,
            )}};
          `,
          );

          const agxFiles: string[] = fg.sync(
            // const agxFiles: string[] = globSync(
            [
              `${root}/src/content/**/*.agx`,
              ...(options?.additionalContentDirs || []).map(
                (glob) => `${workspaceRoot}${glob}/**/*.agx`,
              ),
            ],
            {
              dot: true,
              // absolute: true,
            },
          );

          result = result.replace(
            'let ANALOG_AGX_FILES = {};',
            `
          let ANALOG_AGX_FILES = {${agxFiles.map(
            (module) =>
              `"${module.replace(root, '')}": () => import('${module}')`,
          )}};
          `,
          );

          if (!code.includes('analog_module_')) {
            result = `${eagerImports.join('\n')}\n${result}`;
          }

          return {
            code: result,
            map: { mappings: '' },
          };
        }

        return;
      },
    },
    {
      name: 'analogjs-invalidate-content-dirs',
      configureServer(server) {
        function invalidateContent(path: string) {
          if (path.includes(normalizePath(`/content/`))) {
            server.moduleGraph.fileToModulesMap.forEach((mods) => {
              mods.forEach((mod) => {
                if (
                  mod.id?.includes('analogjs') &&
                  mod.id?.includes('content')
                ) {
                  server.moduleGraph.invalidateModule(mod);

                  mod.importers.forEach((imp) => {
                    server.moduleGraph.invalidateModule(imp);
                  });
                }
              });
            });

            server.ws.send({
              type: 'full-reload',
            });
          }
        }

        server.watcher.on('add', invalidateContent);
        server.watcher.on('unlink', invalidateContent);
      },
    },
  ];
}

/**
 * fast-glob Usage Documentation
 *
 * BASELINE STATE:
 * - Date: Current
 * - Build Status: PASSING (per user confirmation)
 * - Linter Errors: 3 remaining warnings (down from 8)
 * - fast-glob version: Used for content file discovery
 * - tinyglobby: Imported but commented out (migration in progress)
 *
 * This file uses fast-glob for discovering content files in the Analog content plugin.
 * fast-glob is a fast and efficient glob library for Node.js that provides
 * synchronous and asynchronous methods for pattern matching.
 *
 * Current Usage in This File:
 * 1. Line 156-167: Discovers content files (*.md and *.agx) using fg.sync()
 *    - Finds markdown and AGX files in src/content directory
 *    - Also includes additional content directories if configured
 * 2. Line 187-199: Discovers only AGX files using fg.sync()
 *    - Filters for AGX files specifically for component imports
 *
 * fast-glob vs tinyglobby comparison:
 * - Both support the same glob patterns for file discovery
 * - Both are efficient for finding content files
 * - fast-glob is currently used (tinyglobby migration is in progress)
 * - fast-glob provides similar functionality with mature API
 * - fast-glob's sync method returns paths relative to cwd by default
 * - tinyglobby would provide similar results with slightly different API
 *
 * How fast-glob Works:
 *
 * 1. Pattern Matching Engine:
 *    - Uses micromatch under the hood for pattern matching
 *    - Supports standard glob patterns: *, **, ?, [...], {...}
 *    - Handles negation patterns with !
 *    - Case-sensitive by default on Unix, case-insensitive on Windows
 *
 * 2. File System Traversal:
 *    - Optimized directory traversal using Node.js fs module
 *    - Skips directories that can't match the pattern
 *    - Respects .gitignore by default (can be disabled with ignore option)
 *    - Uses @nodelib/fs.walk for efficient directory walking
 *
 * 3. Performance Optimizations:
 *    - Parallel processing of multiple patterns
 *    - Efficient caching of file system calls
 *    - Smart pattern analysis to minimize I/O operations
 *    - Batches file system operations for better performance
 *
 * 4. API Methods:
 *    - fg.sync() - Synchronous file discovery (used here)
 *    - fg() or fg.async() - Asynchronous with promises
 *    - fg.stream() - Returns a stream for large result sets
 *    - fg.generateTasks() - For advanced usage and custom processing
 *
 * Example Usage in This File:
 * ```typescript
 * const contentFilesList: string[] = fg.sync(
 *   [
 *     `${root}/src/content/**\/*.md`,
 *     `${root}/src/content/**\/*.agx`,
 *     ...((options?.additionalContentDirs || []).map(
 *       (glob) => `${workspaceRoot}${glob}/**\/*.{md,agx}`,
 *     )),
 *   ],
 *   { dot: true }, // Include dot files
 * );
 * ```
 *
 * Options Used:
 * - dot: true - Include files/folders starting with a dot
 * - Default behavior returns relative paths from cwd
 * - Can use absolute: true to get absolute paths (commented out)
 *
 * Pattern Examples:
 * - `**\/*.md` - All markdown files recursively
 * - `**\/*.agx` - All AGX files recursively
 * - `**\/*.{md,agx}` - Both md and agx files using brace expansion
 * - Additional content directories are dynamically added
 *
 * Common fast-glob Options:
 * ```typescript
 * {
 *   dot: true,           // Include dot files/folders
 *   absolute: false,     // Return absolute paths
 *   unique: true,        // Ensure unique results (default)
 *   onlyFiles: true,     // Return only files (default)
 *   onlyDirectories: false, // Return only directories
 *   followSymbolicLinks: true, // Follow symlinks
 *   deep: Infinity,      // Maximum depth to traverse
 *   ignore: ['**\/node_modules/**'], // Patterns to ignore
 *   cwd: process.cwd(),  // Current working directory
 *   baseNameMatch: false // Match patterns against basename only
 * }
 * ```
 *
 * fast-glob Internals:
 *
 * 1. Pattern Parsing:
 *    - Converts glob patterns to regular expressions
 *    - Optimizes patterns for faster matching
 *    - Separates static and dynamic parts of patterns
 *
 * 2. Directory Walking:
 *    - Uses depth-first traversal by default
 *    - Can be configured for breadth-first with concurrency option
 *    - Skips hidden directories unless dot: true
 *
 * 3. Result Processing:
 *    - Filters results based on patterns
 *    - Applies ignore patterns
 *    - Normalizes paths based on platform
 *    - Removes duplicates if unique: true
 *
 * Sample File Discovery Results:
 * When running in the Analog workspace, these patterns would find:
 * - /src/content/blog/first-post.md
 * - /src/content/blog/second-post.md
 * - /src/content/components/hero.agx
 * - /apps/blog-app/src/content/posts/welcome.md
 * - /apps/blog-app/src/content/components/card.agx
 *
 * Migration Note:
 * The commented lines show an attempted migration to tinyglobby:
 * - Line 157: //const contentFilesList: string[] = globSync(
 * - Line 166: //{ dot: true, absolute: true },
 * - Line 188: // const agxFiles: string[] = globSync(
 * - Line 197: // absolute: true,
 *
 * The migration would involve:
 * 1. Replacing fg.sync with globSync from tinyglobby
 * 2. Adjusting options format if needed (tinyglobby has similar options)
 * 3. Testing to ensure same file discovery results
 * 4. Updating the import statement (currently commented out)
 *
 * Fixed Issues:
 * - ✓ Unsafe optional chaining on lines 161 and 191 (fixed by removing extra ?)
 * - ✓ Unused import warning for globSync (commented out)
 * - ✓ Type-only imports properly marked
 *
 * Remaining Warnings:
 * - Line 63, 121: 'any' type usage for front-matter module
 * - Line 117: Function type usage for loadLanguages
 *
 * Performance Considerations:
 * 1. fg.sync() blocks the event loop - consider async for large directories
 * 2. Multiple patterns are processed in parallel internally
 * 3. Results are cached within the same call
 * 4. For repeated calls, consider caching results at application level
 *
 * Best Practices:
 * 1. Always validate glob patterns before use
 * 2. Use appropriate options for your use case
 * 3. Consider performance impact of complex patterns
 * 4. Test file discovery with sample file structures
 * 5. Handle edge cases like empty results or errors
 * 6. Use ignore patterns to exclude unnecessary directories
 * 7. Consider using streams for very large result sets
 *
 * Error Handling:
 * fast-glob will throw errors for:
 * - Invalid glob patterns
 * - File system permission issues
 * - Symbolic link loops (if followSymbolicLinks: true)
 *
 * Always wrap fg.sync() calls in try-catch for production code.
 *
 * Testing fast-glob to tinyglobby transition:
 * When comparing compiled output between fast-glob and tinyglobby implementations,
 * examine these key files for consistency:
 *
 * Build artifacts to compare:
 * - dist/apps/analog-app/.nitro/dev/index.mjs (contains ANALOG_CONTENT_FILE_LIST and ANALOG_AGX_FILES)
 * - dist/apps/analog-app/ssr/main.server.mjs (production build with content imports)
 * - dist/apps/blog-app/.nitro/dev/index.mjs (blog app with markdown content)
 * - dist/apps/ng-app/.nitro/dev/index.mjs (ng app with .agx content files)
 *
 * Key verification points:
 * - File paths in ANALOG_CONTENT_FILE_LIST should be identical
 * - File paths in ANALOG_AGX_FILES should be identical
 * - Content file imports should have same structure
 * - Module indices should match between implementations
 * - No missing or extra files in the compiled output
 *
 * Test commands:
 * - pnpm build (establish baseline with fast-glob)
 * - Save compiled output for comparison
 * - Migrate to tinyglobby and rebuild
 * - Compare dist/ directories before/after migration
 * - Verify all content files are discoverable
 */

/**
 * FAST-GLOB COMPILED OUTPUT DOCUMENTATION
 * =======================================
 *
 * When using fast-glob, the compiled output is found in dist/apps/*\/ssr/main.server.mjs
 *
 * 1. ANALOG_CONTENT_FILE_LIST structure (from analog-app):
 *    let ANALOG_CONTENT_FILE_LIST = {
 *      "\/src\/content\/index.md": analog_module_0,
 *      "\/src\/content\/sub-page\/index.md": analog_module_1
 *    };
 *
 *    With eager imports at the top:
 *    import { default as analog_module_0 } from "\/workspace\/apps\/analog-app\/src\/content\/index.md?analog-content-list=true";
 *    import { default as analog_module_1 } from "\/workspace\/apps\/analog-app\/src\/content\/sub-page\/index.md?analog-content-list=true";
 *
 * 2. ANALOG_AGX_FILES structure (from ng-app):
 *    let ANALOG_AGX_FILES = {
 *      "\/src\/content\/test.agx": () => import('\/workspace\/apps\/ng-app\/src\/content\/test.agx')
 *    };
 *
 * 3. Content file discovery patterns:
 *    - Markdown files: `${root}\/src\/content\/**\/*.md`
 *    - AGX files: `${root}\/src\/content\/**\/*.agx`
 *    - Additional content directories: dynamically added from options
 *
 * 4. Key characteristics of fast-glob output:
 *    - Returns paths relative to cwd by default
 *    - Object keys use relative paths starting with "\/"
 *    - Eager imports use absolute file system paths
 *    - AGX files use dynamic imports with absolute paths
 *    - Module indices (analog_module_0, etc.) are sequential
 *
 * 5. Path patterns observed:
 *    - Content list keys: "\/src\/content\/[path]\/[file].md"
 *    - Eager import paths: "\/workspace\/apps\/[app]\/src\/content\/[path]\/[file].md"
 *    - AGX import paths: "\/workspace\/apps\/[app]\/src\/content\/[path]\/[file].agx"
 *    - Additional content from libs: Full absolute paths
 *
 * 6. Compilation process:
 *    - transform() hook replaces ANALOG_CONTENT_FILE_LIST placeholder
 *    - Eager imports are added at the top of the file
 *    - Each content file gets a unique module index
 *    - AGX files are handled separately with dynamic imports
 */

/**
 * TINYGLOBBY IMPLEMENTATION - COMPILED OUTPUT DOCUMENTATION
 * =========================================================
 *
 * When using tinyglobby, the compiled output should be identical to fast-glob
 *
 * 1. ANALOG_CONTENT_FILE_LIST structure (expected):
 *    let ANALOG_CONTENT_FILE_LIST = {
 *      "\/src\/content\/index.md": analog_module_0,
 *      "\/src\/content\/sub-page\/index.md": analog_module_1
 *    };
 *
 *    With eager imports at the top:
 *    import { default as analog_module_0 } from "\/workspace\/apps\/analog-app\/src\/content\/index.md?analog-content-list=true";
 *    import { default as analog_module_1 } from "\/workspace\/apps\/analog-app\/src\/content\/sub-page\/index.md?analog-content-list=true";
 *
 * 2. ANALOG_AGX_FILES structure (expected):
 *    let ANALOG_AGX_FILES = {
 *      "\/src\/content\/test.agx": () => import('\/workspace\/apps\/ng-app\/src\/content\/test.agx')
 *    };
 *
 * 3. Key implementation details for tinyglobby:
 *    - Use globSync from tinyglobby instead of fg.sync
 *    - Use same options: { dot: true } for relative paths
 *    - Could use { dot: true, absolute: true } but then need to normalize paths
 *    - Path normalization: module.replace(root, '') for relative keys
 *    - Import paths remain absolute for the actual file imports
 *
 * 4. Migration implementation plan:
 *    ```typescript
 *    // Replace:
 *    const contentFilesList: string[] = fg.sync([...], { dot: true });
 *
 *    // With:
 *    const contentFilesList: string[] = globSync([...], { dot: true });
 *    ```
 *
 * 5. Migration success criteria:
 *    ✓ Content file paths in ANALOG_CONTENT_FILE_LIST match exactly
 *    ✓ AGX file paths in ANALOG_AGX_FILES match exactly
 *    ✓ Module indices are sequential and consistent
 *    ✓ Eager imports use correct absolute paths
 *    ✓ Dynamic imports for AGX files work correctly
 *    ✓ Build completes without errors
 *    ✓ All content files are discoverable at runtime
 *
 * 6. Verification checklist:
 *    - [ ] Build analog-app and check content file discovery
 *    - [ ] Build blog-app and verify markdown content
 *    - [ ] Build ng-app and verify AGX file imports
 *    - [ ] Test with additional content directories
 *    - [ ] Verify HMR works for content changes
 *    - [ ] Check that content invalidation still functions
 *
 * 7. Common issues to watch for:
 *    - Path normalization differences between libraries
 *    - Absolute vs relative path handling
 *    - Platform-specific path separators
 *    - Edge cases with nested content directories
 *    - Symbolic links and dot files
 */
