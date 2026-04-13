// Fails fast when a release-critical target stops declaring the prerequisite
// targets that the release/build pipeline assumes will run first.
//
// The value here is narrow but important:
// - it keeps release ordering explicit and reviewable in project.json
// - it catches config drift before a release script builds in the wrong order
// - it verifies the exact target prerequisites a release step relies on,
//   instead of only checking that two projects are loosely related
// - it avoids Nx project-graph creation so prepare/install remains stable in CI
//   workspaces that include nested refs or comparison checkouts
//
// This is intentionally not a full Nx graph or runtime import validation. It
// only proves that a source target still declares explicit prerequisite
// targets in workspace config, which is the contract the release scripts
// depend on.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ProjectConfig {
  name?: string;
  implicitDependencies?: string[];
  targets?: Record<string, TargetConfig>;
}

interface TargetConfig {
  dependsOn?: DependsOnEntry[];
}

type DependsOnEntry =
  | string
  | {
      dependencies?: boolean;
      projects?: string | string[];
      target?: string;
    };

interface ProjectRecord {
  path: string;
  config: ProjectConfig;
}

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const projectRoots = ['apps', 'libs', 'packages'];
const ignoredDirs = new Set([
  '.git',
  '.nx',
  'dist',
  'node_modules',
  'refs',
  'tmp',
]);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function collectProjectFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const projectFiles: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || ignoredDirs.has(entry.name)) {
      continue;
    }

    const fullPath = join(root, entry.name);
    const projectFile = join(fullPath, 'project.json');
    if (existsSync(projectFile)) {
      projectFiles.push(projectFile);
      continue;
    }

    projectFiles.push(...collectProjectFiles(fullPath));
  }

  return projectFiles;
}

function loadProjects(): Map<string, ProjectRecord> {
  const projects = new Map<string, ProjectRecord>();

  for (const projectRoot of projectRoots) {
    for (const projectFile of collectProjectFiles(
      resolve(workspaceRoot, projectRoot),
    )) {
      const config = readJsonFile(projectFile) as ProjectConfig;
      if (!config.name) {
        continue;
      }

      projects.set(config.name, {
        path: projectFile,
        config,
      });
    }
  }

  return projects;
}

function normalizeDependsOn(
  dependsOn: TargetConfig['dependsOn'],
): DependsOnEntry[] {
  return Array.isArray(dependsOn) ? dependsOn : [];
}

function parseDependencySpec(value: string): {
  project: string;
  target: string;
} {
  const separatorIndex = value.indexOf(':');
  invariant(
    separatorIndex > 0 && separatorIndex < value.length - 1,
    `Expected dependency target in "project:target" format, received "${value}".`,
  );

  return {
    project: value.slice(0, separatorIndex),
    target: value.slice(separatorIndex + 1),
  };
}

function includesProjectReference(
  entry: Exclude<DependsOnEntry, string>,
  project: string,
): boolean {
  if (entry.projects === project) {
    return true;
  }

  return Array.isArray(entry.projects) && entry.projects.includes(project);
}

function declaresDependencyTarget(
  sourceTarget: TargetConfig,
  dependencyProject: string,
  dependencyTarget: string,
): boolean {
  for (const dependency of normalizeDependsOn(sourceTarget.dependsOn)) {
    if (typeof dependency === 'string') {
      if (dependency === `${dependencyProject}:${dependencyTarget}`) {
        return true;
      }

      continue;
    }

    if (dependency.target !== dependencyTarget || dependency.dependencies) {
      continue;
    }

    if (includesProjectReference(dependency, dependencyProject)) {
      return true;
    }
  }

  return false;
}

const [, , source, sourceTargetName, ...requiredDependencySpecs] = process.argv;

invariant(
  source && sourceTargetName && requiredDependencySpecs.length > 0,
  'Usage: node tools/scripts/assert-project-dependency.mts <source-project> <source-target> <required-project:target>...',
);

const projects = loadProjects();
const sourceProject = projects.get(source);

invariant(
  sourceProject,
  `Project "${source}" was not found in workspace project.json files.`,
);

const sourceTarget = sourceProject.config.targets?.[sourceTargetName];

invariant(
  sourceTarget,
  `Target "${sourceTargetName}" was not found in ${sourceProject.path}.`,
);

for (const dependencySpec of requiredDependencySpecs) {
  const dependency = parseDependencySpec(dependencySpec);
  const dependencyProject = projects.get(dependency.project);

  invariant(
    dependencyProject,
    `Project "${dependency.project}" was not found in workspace project.json files.`,
  );

  invariant(
    dependencyProject.config.targets?.[dependency.target],
    `Target "${dependency.target}" was not found in ${dependencyProject.path}.`,
  );

  invariant(
    declaresDependencyTarget(
      sourceTarget,
      dependency.project,
      dependency.target,
    ),
    `Expected "${source}:${sourceTargetName}" to declare "${dependency.project}:${dependency.target}" in ${sourceProject.path}.`,
  );
}
