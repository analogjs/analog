import { NitroEventHandler } from 'nitropack';
import * as path from 'path';
import fg from 'fast-glob';

type GetHandlersArgs = {
  workspaceRoot: string;
  rootDir: string;
};

export function getPageHandlers({ workspaceRoot, rootDir }: GetHandlersArgs) {
  const root = path.resolve(workspaceRoot, rootDir);

  const endpointFiles: string[] = fg.sync(
    [`${root}/src/app/pages/**/*.server.ts`],
    { dot: true }
  );

  const handlers: NitroEventHandler[] = endpointFiles.map((endpointFile) => {
    const route = endpointFile
      .replace(path.resolve(workspaceRoot, rootDir, 'src/app'), '')
      .replace(/\.server\.ts$/, '')
      .replace(/\[\.{3}]/g, '**')
      .replace(/\[\.{3}(\w+)]/g, '**:$1')
      .replace(/\/\((.*?)\)$/, '/-$1-')
      .replace(/\[(\w+)]/g, ':$1')
      .replace(/\./g, '/');

    return {
      handler: endpointFile,
      route: `/_analog${route}`,
      lazy: true,
    };
  });

  return handlers;
}
