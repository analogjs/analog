import { Tree, getProjects, joinPathFragments } from '@nx/devkit';

import { SetupAnalogGeneratorSchema } from '../schema';

export function updateIndex(tree: Tree, schema: SetupAnalogGeneratorSchema) {
  const projects = getProjects(tree);
  const projectConfig = projects.get(schema.project);

  const indexPath = joinPathFragments(projectConfig.root, 'src/index.html');
  const newIndexPath = joinPathFragments(projectConfig.root, 'index.html');

  if (tree.exists(indexPath)) {
    const indexContents = tree.read(indexPath, 'utf-8');
    let updatedIndex = indexContents.replace(
      '</body>',
      '<script type="module" src="/src/main.ts"></script></body>',
    );
    updatedIndex = updatedIndex.replace(`"favicon.ico"`, `"/favicon.ico"`);
    tree.write(indexPath, updatedIndex);
    tree.rename(indexPath, newIndexPath);
  }
}
