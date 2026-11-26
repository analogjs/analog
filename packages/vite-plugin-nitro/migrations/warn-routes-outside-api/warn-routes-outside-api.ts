import {
  DirEntry,
  Rule,
  SchematicContext,
  Tree,
} from '@angular-devkit/schematics';

const ROUTES_DIR = '/src/server/routes';

function findRoutesDirectories(directory: DirEntry, found: DirEntry[]): void {
  if (directory.path.endsWith(ROUTES_DIR)) {
    found.push(directory);
    return;
  }
  for (const name of directory.subdirs) {
    if (name !== 'node_modules' && !name.startsWith('.')) {
      findRoutesDirectories(directory.dir(name), found);
    }
  }
}

function collectFiles(directory: DirEntry, files: string[]): void {
  for (const file of directory.subfiles) {
    files.push(`${directory.path}/${file}`);
  }
  for (const name of directory.subdirs) {
    collectFiles(directory.dir(name), files);
  }
}

function handlersOutsideApi(routes: DirEntry): string[] {
  const files = routes.subfiles.map((file) => `${routes.path}/${file}`);
  for (const name of routes.subdirs) {
    if (name !== 'api') {
      collectFiles(routes.dir(name), files);
    }
  }
  return files;
}

export default function warnRoutesOutsideApi(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const found: DirEntry[] = [];
    findRoutesDirectories(tree.root, found);
    for (const routes of found) {
      const files = handlersOutsideApi(routes);
      if (files.length === 0) {
        continue;
      }
      context.logger.warn(
        `Analog 3 no longer serves ${routes.path} under the API prefix (default /api). ` +
          `These handlers now answer only at their own path: ${files.join(', ')}. ` +
          `If your app requests them under the API prefix, move them into ${routes.path}/api. ` +
          `A request for a missing API route falls through to the page renderer, ` +
          `which can make SSR and prerendering wait forever when a page requests that route.`,
      );
    }
  };
}
