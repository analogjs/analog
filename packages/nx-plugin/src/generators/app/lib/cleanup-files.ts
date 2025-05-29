import { Tree } from '@nx/devkit';
import { NormalizedOptions } from '../generator';

export function cleanupFiles(tree: Tree, options: NormalizedOptions): void {
  const files = [
    'src/app/app.component.css',
    'src/app/app.component.html',
    'src/app/app.routes.ts',
    'src/app/nx-welcome.component.ts',
    'src/index.html',
    'vite.config.mts',
  ];

  if (!options.isNx) {
    files.push('project.json');
  }

  files.forEach((file) => {
    const filePath = `${options.projectRoot}/${file}`;
    if (tree.exists(filePath)) {
      tree.delete(filePath);
    }
  });
}
