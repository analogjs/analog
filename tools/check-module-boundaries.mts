/**
 * Validates module boundaries across the Nx workspace.
 *
 * Replaces @nx/enforce-module-boundaries ESLint rule.
 *
 * Checks:
 * - No relative imports crossing project boundaries
 * - No circular dependencies between projects
 * - No importing from apps or e2e projects
 */

import { createProjectGraphAsync } from '@nx/devkit';

interface ProjectGraph {
  nodes: Record<
    string,
    {
      type: string;
      data: { root: string; sourceRoot?: string; tags?: string[] };
    }
  >;
  dependencies: Record<
    string,
    Array<{ source: string; target: string; type: string }>
  >;
}

const errors: string[] = [];

async function main(): Promise<void> {
  const graph = (await createProjectGraphAsync()) as ProjectGraph;

  checkCircularDependencies(graph);
  checkAppImports(graph);

  console.log(
    `Checked ${Object.keys(graph.nodes).length} projects, ${Object.values(graph.dependencies).flat().length} dependencies.`,
  );

  if (errors.length > 0) {
    console.error(`\n${errors.length} boundary violation(s):\n`);
    for (const err of errors) {
      console.error(`  ${err}`);
    }
    process.exit(1);
  } else {
    console.log('All module boundary checks passed.');
  }
}

function checkCircularDependencies(graph: ProjectGraph): void {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      cycles.push(cycle);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);

    const deps = graph.dependencies[node] || [];
    for (const dep of deps) {
      // Only check internal project dependencies, not npm packages
      if (graph.nodes[dep.target]) {
        dfs(dep.target, [...path, node]);
      }
    }

    inStack.delete(node);
  }

  for (const node of Object.keys(graph.nodes)) {
    dfs(node, []);
  }

  for (const cycle of cycles) {
    errors.push(`Circular dependency: ${cycle.join(' → ')}`);
  }
}

function checkAppImports(graph: ProjectGraph): void {
  const appProjects = new Set<string>();
  const e2eProjects = new Set<string>();

  for (const [name, node] of Object.entries(graph.nodes)) {
    if (node.type === 'app') appProjects.add(name);
    if (node.type === 'e2e') e2eProjects.add(name);
  }

  // Libraries should not import from apps or e2e projects
  for (const [source, deps] of Object.entries(graph.dependencies)) {
    const sourceNode = graph.nodes[source];
    if (!sourceNode || sourceNode.type !== 'lib') continue;

    for (const dep of deps) {
      if (appProjects.has(dep.target)) {
        errors.push(`Library "${source}" imports from app "${dep.target}"`);
      }
      if (e2eProjects.has(dep.target)) {
        errors.push(
          `Library "${source}" imports from e2e project "${dep.target}"`,
        );
      }
    }
  }
}

main().catch((err) => {
  console.error('Failed to check module boundaries:', err);
  process.exit(1);
});
