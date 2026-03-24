import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '../..');
const DEBUG_NAMESPACE = 'analog:nx-project-graph';

function escapeRegExp(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}

// Match DEBUG namespaces the same way the ad-hoc build diagnostics do so
// `DEBUG=analog:*` turns on every temporary probe consistently in CI.
function isDebugEnabled(namespace: string) {
  const debugValue = process.env['DEBUG'];
  if (!debugValue) {
    return false;
  }

  return debugValue
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((pattern) => {
      const matcher = new RegExp(
        `^${escapeRegExp(pattern).replace(/\\\*/g, '.*')}$`,
      );
      return matcher.test(namespace);
    });
}

function debug(label: string, details?: Record<string, unknown>) {
  if (details && Object.keys(details).length > 0) {
    console.log(`DEBUG: ${label}`, details);
    return;
  }

  console.log(`DEBUG: ${label}`);
}

function listEntries(path: string) {
  if (!existsSync(path)) {
    return ['<<missing>>'];
  }

  try {
    return readdirSync(path).sort();
  } catch (error) {
    return [
      `<<unable to read directory: ${error instanceof Error ? error.message : String(error)}>>`,
    ];
  }
}

function readJsonSummary(path: string) {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      path: relative(workspaceRoot, path),
      name: typeof parsed['name'] === 'string' ? parsed['name'] : '<<missing>>',
      keys: Object.keys(parsed).sort(),
    };
  } catch (error) {
    return {
      path: relative(workspaceRoot, path),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectManifestSummaries(
  startDir: string,
  maxDepth: number,
  currentDepth = 0,
): Array<Record<string, unknown>> {
  if (!existsSync(startDir)) {
    return [];
  }

  const summaries: Array<Record<string, unknown>> = [];

  for (const entry of readdirSync(startDir).sort()) {
    const fullPath = join(startDir, entry);
    const relativePath = relative(workspaceRoot, fullPath);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (
        currentDepth < maxDepth &&
        entry !== 'node_modules' &&
        entry !== 'dist' &&
        entry !== '.git'
      ) {
        summaries.push(
          ...collectManifestSummaries(fullPath, maxDepth, currentDepth + 1),
        );
      }
      continue;
    }

    if (entry === 'project.json' || entry === 'package.json') {
      const summary = readJsonSummary(fullPath);
      summaries.push(
        summary ?? {
          path: relativePath,
          error: 'Unable to summarize manifest',
        },
      );
    }
  }

  return summaries;
}

// This script is intentionally quiet unless the debug namespace is enabled,
// because it is wired into normal build targets as a preflight probe.
if (!isDebugEnabled(DEBUG_NAMESPACE)) {
  process.exit(0);
}

const target = process.argv[2] ?? 'unknown-target';
const suspiciousRoot = resolve(
  workspaceRoot,
  'packages/create-analog/__tests__',
);
const suspiciousProject = resolve(suspiciousRoot, 'test-app');

debug('nx project graph preflight', {
  target,
  cwd: process.cwd(),
  workspaceRoot,
  debug: process.env['DEBUG'] ?? '',
});

// The failing Nx graph reports a nameless project under this fixture path, so
// dump both the directory and any nearby manifests right before graph creation.
debug('suspicious fixture root state', {
  path: relative(workspaceRoot, suspiciousRoot),
  exists: existsSync(suspiciousRoot),
  entries: listEntries(suspiciousRoot),
});

debug('suspicious fixture project state', {
  path: relative(workspaceRoot, suspiciousProject),
  exists: existsSync(suspiciousProject),
  entries: listEntries(suspiciousProject),
  projectJson: readJsonSummary(join(suspiciousProject, 'project.json')),
  packageJson: readJsonSummary(join(suspiciousProject, 'package.json')),
});

debug('create-analog nearby manifests', {
  manifests: collectManifestSummaries(
    resolve(workspaceRoot, 'packages/create-analog'),
    2,
  ),
});

debug('workspace root manifests', {
  nxJson: readJsonSummary(resolve(workspaceRoot, 'nx.json')),
  rootPackageJson: readJsonSummary(resolve(workspaceRoot, 'package.json')),
});
