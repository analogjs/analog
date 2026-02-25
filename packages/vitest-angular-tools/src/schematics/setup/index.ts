import {
  Rule,
  Tree,
  apply,
  url,
  applyTemplates,
  move,
  chain,
  mergeWith,
  SchematicContext,
} from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import { parse } from 'jsonc-parser';
import {
  getAngularVersion,
  getMajorAngularVersion,
  getWorkspace,
  getProject,
  addDevDependencies,
  isNxWorkspace,
} from '../utils';
import { Schema } from './schema';

function updateTsConfigSpec(tree: Tree, projectRoot: string): void {
  const tsConfigPath = projectRoot
    ? `${projectRoot}/tsconfig.spec.json`
    : 'tsconfig.spec.json';

  if (!tree.exists(tsConfigPath)) {
    return;
  }

  const tsConfigContent = tree.read(tsConfigPath);
  if (!tsConfigContent) {
    return;
  }

  const tsConfig = parse(tsConfigContent.toString('utf-8')) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;

  tsConfig.compilerOptions = tsConfig.compilerOptions || {};

  // Remove module (let Vite handle it)
  delete tsConfig.compilerOptions.module;

  // Set target to es2022
  tsConfig.compilerOptions.target = 'es2022';

  // Update types: remove jest, add vitest/globals
  const types: string[] = tsConfig.compilerOptions.types || ['node'];
  const filteredTypes = types.filter(
    (t: string) => t !== 'jest' && t !== 'jasmine',
  );
  if (!filteredTypes.includes('vitest/globals')) {
    filteredTypes.push('vitest/globals');
  }
  tsConfig.compilerOptions.types = filteredTypes;

  // Set files to include test-setup.ts
  tsConfig.files = ['src/test-setup.ts'];

  tree.overwrite(tsConfigPath, JSON.stringify(tsConfig, null, 2) + '\n');
}

function updateAngularJson(tree: Tree, projectName: string): void {
  const workspace = getWorkspace(tree);
  const project = workspace.projects[projectName];

  if (!project.architect) {
    project.architect = {};
  }

  project.architect['test'] = {
    builder: '@analogjs/vitest-angular:test',
  };

  tree.overwrite('angular.json', JSON.stringify(workspace, null, 2) + '\n');
}

function generateFiles(
  projectRoot: string,
  majorAngularVersion: number,
  isNx: boolean,
  browserMode: boolean,
): Rule {
  return mergeWith(
    apply(url('./files'), [
      applyTemplates({
        majorAngularVersion,
        isNx,
        browserMode,
      }),
      move(projectRoot),
    ]),
  );
}

export function setupSchematic(options: Schema): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const angularVersion = getAngularVersion(tree);
    const majorAngularVersion = getMajorAngularVersion(angularVersion);

    const workspace = getWorkspace(tree);
    const project = getProject(workspace, options.project);
    const projectRoot = project.root || '';
    const isNx = isNxWorkspace(tree);

    const browserMode = options.browserMode ?? false;

    // Add devDependencies
    addDevDependencies(tree, angularVersion, { browserMode });

    // Update tsconfig.spec.json (if exists)
    updateTsConfigSpec(tree, projectRoot);

    // Update angular.json test target
    updateAngularJson(tree, options.project);

    // Schedule package install
    context.addTask(new NodePackageInstallTask());

    // Generate files
    return chain([
      generateFiles(projectRoot, majorAngularVersion, isNx, browserMode),
    ]);
  };
}
