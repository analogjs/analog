import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { normalizePath } from 'vite';
import { createRequire } from 'node:module';
import { globSync } from 'tinyglobby';

import { PrerenderContentFile } from '../options';

const require = createRequire(import.meta.url);

/**
 * Discovers content files with front matter and extracts metadata for prerendering.
 *
 * This function:
 * 1. Discovers all content files matching the specified glob pattern
 * 2. Reads each file and parses front matter metadata
 * 3. Extracts file name, extension, and path information
 * 4. Returns structured data for prerendering content pages
 *
 * @param workspaceRoot The workspace root directory path
 * @param rootDir The project root directory relative to workspace
 * @param glob The glob pattern to match content files (e.g., 'content/blog')
 * @returns Array of PrerenderContentFile objects with metadata and front matter
 *
 * Example usage:
 * const contentFiles = getMatchingContentFilesWithFrontMatter(
 *   '/workspace',
 *   'apps/my-app',
 *   'content/blog'
 * );
 *
 * Sample discovered file paths:
 * - /workspace/apps/my-app/content/blog/first-post.md
 * - /workspace/apps/my-app/content/blog/2024/01/hello-world.md
 * - /workspace/apps/my-app/content/blog/tech/angular-v17.mdx
 * - /workspace/apps/my-app/content/blog/about/index.md
 *
 * Sample output structure:
 * {
 *   name: 'first-post',
 *   extension: 'md',
 *   path: 'content/blog',
 *   attributes: { title: 'My First Post', date: '2024-01-01', tags: ['intro'] }
 * }
 *
 * tinyglobby vs fast-glob comparison:
 * - Both support the same glob patterns for file discovery
 * - Both are efficient for finding content files
 * - tinyglobby is now used instead of fast-glob
 * - tinyglobby provides similar functionality with smaller bundle size
 * - tinyglobby's globSync returns absolute paths when absolute: true is set
 *
 * Front matter parsing:
 * - Uses front-matter library to parse YAML/TOML front matter
 * - Extracts metadata like title, date, tags, author, etc.
 * - Supports both YAML (---) and TOML (+++) delimiters
 * - Returns structured attributes for prerendering
 *
 * File path processing:
 * - Normalizes paths for cross-platform compatibility
 * - Extracts file name without extension
 * - Determines file extension for content type handling
 * - Maintains relative path structure for routing
 */
export function getMatchingContentFilesWithFrontMatter(
  workspaceRoot: string,
  rootDir: string,
  glob: string,
): PrerenderContentFile[] {
  // Dynamically require front-matter library
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fm = require('front-matter');

  // Normalize the project root path for consistent path handling
  const root = normalizePath(resolve(workspaceRoot, rootDir));

  // Resolve the content directory path relative to the project root
  const resolvedDir = normalizePath(relative(root, join(root, glob)));

  // Discover all content files in the specified directory
  // Pattern: looks for any files in the resolved directory
  const contentFiles: string[] = globSync([`${root}/${resolvedDir}/*`], {
    dot: true,
    absolute: true,
  });

  // Process each discovered content file to extract metadata and front matter
  const mappedFilesWithFm: PrerenderContentFile[] = contentFiles.map((f) => {
    // Read the file contents as UTF-8 text
    const fileContents = readFileSync(f, 'utf8');

    // Parse front matter from the file content
    const raw = fm(fileContents);

    // Get the relative file path by removing the root directory
    const filepath = f.replace(root, '');

    // Extract file name and extension using regex
    // Matches: /filename.ext or /filename (with optional extension)
    const match = filepath.match(/\/([^/.]+)(\.([^/.]+))?$/);
    let name = '';
    let extension = '';
    if (match) {
      name = match[1]; // File name without extension
      extension = match[3] || ''; // File extension or empty string if no extension
    }

    // Return structured content file data for prerendering
    return {
      name,
      extension,
      path: resolvedDir,
      attributes: raw.attributes as { attributes: Record<string, any> },
    };
  });

  return mappedFilesWithFm;
}
