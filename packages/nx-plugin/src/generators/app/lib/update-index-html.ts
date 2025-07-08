import { Tree, getProjects, joinPathFragments } from '@nx/devkit';

export function updateIndex(tree: Tree, projectName: string) {
  const projects = getProjects(tree);
  const projectConfig = projects.get(projectName);

  const indexPath = joinPathFragments(projectConfig.root, 'index.html');

  if (tree.exists(indexPath)) {
    const indexContents = tree.read(indexPath, 'utf-8');
    const updatedIndex = indexContents.replace(
      '</head>',
      `<link rel="stylesheet" href="/src/styles.css" />
      </head>`,
    );

    tree.write(indexPath, updatedIndex);
  }
}
