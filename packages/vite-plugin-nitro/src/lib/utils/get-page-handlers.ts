import { resolve } from 'node:path';
import fg from 'fast-glob';

import { NitroEventHandler } from 'nitropack';
import { normalizePath } from 'vite';

type GetHandlersArgs = {
  workspaceRoot: string;
  rootDir: string;
  additionalPagesDirs?: string[];
};

export function getPageHandlers({
  workspaceRoot,
  rootDir,
  additionalPagesDirs,
}: GetHandlersArgs) {
  const root = normalizePath(resolve(workspaceRoot, rootDir));

  const endpointFiles: string[] = fg.sync(
    [
      `${root}/src/app/pages/**/*.server.ts`,
      ...(additionalPagesDirs || []).map(
        (dir) => `${workspaceRoot}${dir}/**/*.server.ts`
      ),
    ],
    { dot: true }
  );

  const handlers: NitroEventHandler[] = endpointFiles.map((endpointFile) => {
    const route = endpointFile
      .replace(/^(.*?)\/pages/, '/pages')
      .replace(/\.server\.ts$/, '')
      .replace(/\[\.{3}(.+)\]/g, '**:$1')
      .replace(/\[\.{3}(\w+)\]/g, '**:$1')
      .replace(/\/\((.*?)\)$/, '/-$1-')
      .replace(/\[(\w+)\]/g, ':$1')
      .replace(/\./g, '/');

    return {
      handler: endpointFile,
      route: `/_analog${route}`,
      lazy: true,
    };
  });

  return handlers;
}
