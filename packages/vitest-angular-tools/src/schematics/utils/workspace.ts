import { Tree, SchematicsException } from '@angular-devkit/schematics';

export interface WorkspaceProject {
  root: string;
  sourceRoot?: string;
  architect?: Record<
    string,
    { builder?: string; options?: Record<string, unknown> }
  >;
}

export interface WorkspaceSchema {
  projects: Record<string, WorkspaceProject>;
}

export function getWorkspace(tree: Tree): WorkspaceSchema {
  const workspaceFile = tree.read('angular.json');
  if (!workspaceFile) {
    throw new SchematicsException('Could not find angular.json');
  }
  return JSON.parse(workspaceFile.toString('utf-8'));
}

export function getProject(
  workspace: WorkspaceSchema,
  projectName: string,
): WorkspaceProject {
  const project = workspace.projects[projectName];
  if (!project) {
    throw new SchematicsException(
      `Project "${projectName}" not found in angular.json`,
    );
  }
  return project;
}
