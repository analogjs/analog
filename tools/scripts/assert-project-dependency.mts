import { readCachedProjectGraph } from '@nx/devkit';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const [, , source, target] = process.argv;

invariant(
  source && target,
  'Usage: node tools/scripts/assert-project-dependency.mts <source-project> <target-project>',
);

const graph = readCachedProjectGraph();
const sourceProject = graph.nodes[source];
const targetProject = graph.nodes[target];

invariant(
  sourceProject,
  `Project "${source}" was not found in the Nx project graph.`,
);
invariant(
  targetProject,
  `Project "${target}" was not found in the Nx project graph.`,
);

const hasDependency = (graph.dependencies[source] ?? []).some(
  (dependency) => dependency.target === target,
);

invariant(
  hasDependency,
  `Expected "${source}" to depend on "${target}" in the Nx project graph.`,
);
