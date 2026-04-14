import { readFileSync } from 'node:fs';
import path from 'node:path';

interface WorkspacePackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function getWorkspaceDependencyExcludes(appRootDir: string): string[] {
  const packageJsonPath = path.resolve(appRootDir, 'package.json');
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8'),
  ) as WorkspacePackageJson;
  const dependencyEntries = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  return Object.entries(dependencyEntries)
    .filter(([, version]) => version.startsWith('workspace:'))
    .map(([name]) => name);
}
