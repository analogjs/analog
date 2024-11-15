/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

// import assert from 'node:assert';
import { dirname, join, relative, resolve } from 'node:path';

import { AngularMemoryOutputFiles } from '../utils';

interface AngularMemoryPluginOptions {
  workspaceRoot?: string;
  angularVersion: number;
  outputFiles: AngularMemoryOutputFiles;
  external?: string[];
}

export async function createAngularMemoryPlugin(
  options: AngularMemoryPluginOptions
) {
  const { normalizePath } = await (Function(
    'return import("vite")'
  )() as Promise<typeof import('vite')>);
  const { outputFiles, external } = options;
  let config;
  let projectRoot: string;
  const workspaceRoot = options?.workspaceRoot || process.cwd();

  return {
    name: 'vite:angular-memory',
    // Ensures plugin hooks run before built-in Vite hooks
    enforce: 'pre',
    config(userConfig: any) {
      config = userConfig;
      projectRoot = resolve(workspaceRoot, config.root || '.');
    },
    async resolveId(source: string, importer: string) {
      // Prevent vite from resolving an explicit external dependency (`externalDependencies` option)
      if (external?.includes(source)) {
        // This is still not ideal since Vite will still transform the import specifier to
        // `/@id/${source}` but is currently closer to a raw external than a resolved file path.
        return source;
      }

      if (importer) {
        if (
          source[0] === '.' &&
          normalizePath(importer).startsWith(projectRoot)
        ) {
          // Remove query if present
          const [importerFile] = importer.split('?', 1);
          source =
            '/' + join(dirname(relative(projectRoot, importerFile)), source);
        }
      }

      const [file] = source.split('?', 1);
      const fileSplits = file.split('/');

      if (outputFiles.has(fileSplits[fileSplits.length - 1])) {
        return fileSplits[fileSplits.length - 1];
      }

      if (outputFiles.has(file)) {
        return join(projectRoot, source);
      }
      return;
    },
    load(id: string) {
      const [file] = id.split('?', 1);
      const relativeFile =
        options.angularVersion < 19
          ? normalizePath(relative(projectRoot, file))
              .replace(/^.*\//, '')
              .replace('.ts', '.js')
          : 'spec-' +
            normalizePath(relative(projectRoot, file))
              .replace('.ts', '.js')
              .replace(/^[./]+/, '_')
              .replace(/\//g, '-');

      const codeContents =
        outputFiles.get(relativeFile)?.contents ||
        outputFiles.get(id)?.contents;
      if (codeContents === undefined) {
        return undefined;
      }

      const code = Buffer.from(codeContents).toString('utf-8');
      const mapContents = outputFiles.get(relativeFile + '.map')?.contents;

      return {
        // Remove source map URL comments from the code if a sourcemap is present.
        // Vite will inline and add an additional sourcemap URL for the sourcemap.
        code: mapContents
          ? code.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '')
          : code,
        map: mapContents && Buffer.from(mapContents).toString('utf-8'),
      };
    },
  };
}
