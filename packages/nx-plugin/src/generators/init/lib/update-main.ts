import { Tree, getProjects, joinPathFragments } from '@nx/devkit';

import { SetupAnalogGeneratorSchema } from '../schema';

export function updateMain(tree: Tree, schema: SetupAnalogGeneratorSchema) {
  const projects = getProjects(tree);
  const projectConfig = projects.get(schema.project);

  const mainPath = joinPathFragments(projectConfig.root, 'src/main.ts');

  if (tree.exists(mainPath)) {
    const mainContents = tree.read(mainPath, 'utf-8');
    let updatedMain = `import 'zone.js';\n${mainContents}`;

    tree.write(mainPath, updatedMain);
  }
}
