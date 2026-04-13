#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { build, type Plugin } from 'vite';

import {
  bundleSizeBuildCommand,
  packageArtifacts,
  runtimeFixtures,
} from './bundle-size-config.mts';

interface RuntimeFixtureMeasurement {
  id: string;
  label: string;
  entry: string;
  rawBytes: number;
  gzipBytes: number;
}

interface PackageArtifactMeasurement {
  projectName: string;
  packageName: string;
  publishDir: string;
  packedBytes: number;
  unpackedBytes: number;
  fileCount: number;
  tarballFilename: string;
  files: PackageArtifactFileMeasurement[];
}

interface PackageArtifactFileMeasurement {
  path: string;
  size: number;
  category: PackageArtifactFileCategory;
}

type PackageArtifactFileCategory =
  | 'asset'
  | 'js'
  | 'json'
  | 'map'
  | 'markdown'
  | 'other'
  | 'typing';

interface NpmPackFileResult {
  path: string;
  size: number;
  mode?: number;
}

interface BundleSizeSnapshot {
  generatedAt: string;
  label: string;
  workspaceRoot: string;
  git: {
    branch: string;
    sha: string;
  };
  runtimeFixtures: RuntimeFixtureMeasurement[];
  packageArtifacts: PackageArtifactMeasurement[];
}

interface NpmPackResult {
  filename: string;
  size: number;
  unpackedSize: number;
  files?: NpmPackFileResult[];
}

interface WorkspacePackage {
  name: string;
  root: string;
  manifest: PackageManifest;
}

interface PackageManifest {
  name: string;
  exports?: Record<string, string | Record<string, string>>;
  main?: string;
  module?: string;
}

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(getOption('workspace-root') ?? scriptRoot);
const defaultOutputPath = resolve(
  root,
  'tmp/bundle-size/current/snapshot.json',
);
const workspacePackages: WorkspacePackage[] = loadWorkspacePackages();

function getOption(name: string): string | undefined {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function loadWorkspacePackages(): WorkspacePackage[] {
  return [
    loadWorkspacePackage('packages/router/package.json'),
    loadWorkspacePackage('packages/content/package.json'),
    loadWorkspacePackage('packages/astro-angular/package.json'),
  ];
}

function loadWorkspacePackage(packageJsonPath: string): WorkspacePackage {
  const absolutePath = resolve(root, packageJsonPath);
  const packageJson = readPackageManifest(absolutePath);

  return {
    name: packageJson.name,
    root: dirname(absolutePath),
    manifest: packageJson,
  };
}

function readPackageManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
}

function isFilePath(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }

  return statSync(path).isFile();
}

function run(command: string, args: string[], cwd = root): string {
  const executable = resolveExecutable(command);
  const resolvedArgs = executable === 'corepack' ? [command, ...args] : args;

  return execFileSync(executable, resolvedArgs, {
    shell: false,
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
  });
}

function resolveExecutable(command: string): string {
  if (command !== 'npm') {
    return command;
  }

  try {
    execFileSync(command, ['--version'], {
      stdio: 'ignore',
      env: process.env,
    });
    return command;
  } catch {
    return 'corepack';
  }
}

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function getGitBranch(): string {
  return run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
}

function getGitSha(): string {
  return run('git', ['rev-parse', 'HEAD']).trim();
}

function bundleExternal(id: string): boolean {
  if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) {
    return false;
  }

  if (id.startsWith('node:')) {
    return true;
  }

  return false;
}

function resolveExportPath(
  entry: string | Record<string, string> | undefined,
): string | undefined {
  if (!entry) {
    return undefined;
  }

  if (typeof entry === 'string') {
    return entry;
  }

  return entry.import ?? entry.default;
}

function resolveManifestImport(
  packageDir: string,
  manifest: PackageManifest,
  subpath: string,
): string | undefined {
  const exportPath = resolveExportPath(manifest.exports?.[subpath]);

  if (exportPath) {
    const resolvedPath = resolve(packageDir, exportPath);
    if (isFilePath(resolvedPath)) {
      return resolvedPath;
    }
  }

  if (subpath === '.') {
    const entry = manifest.module ?? manifest.main;
    if (!entry) {
      return undefined;
    }

    const resolvedPath = resolve(packageDir, entry);
    return isFilePath(resolvedPath) ? resolvedPath : undefined;
  }

  const normalizedSubpath = subpath.replace(/^\.\//u, '');
  const directPath = resolve(packageDir, normalizedSubpath);
  if (isFilePath(directPath)) {
    return directPath;
  }

  const jsPath = resolve(packageDir, `${normalizedSubpath}.js`);
  return isFilePath(jsPath) ? jsPath : undefined;
}

function getWorkspacePackageBuildDirs(
  workspacePackage: WorkspacePackage,
): string[] {
  return [
    resolve(workspacePackage.root, 'dist'),
    resolve(root, 'node_modules', workspacePackage.name),
  ];
}

function resolveWorkspaceAnalogImport(id: string): string | undefined {
  const workspacePackage = [...workspacePackages]
    .sort((left, right) => right.name.length - left.name.length)
    .find(
      (candidate) =>
        id === candidate.name || id.startsWith(`${candidate.name}/`),
    );

  if (!workspacePackage) {
    return undefined;
  }

  const subpath =
    id === workspacePackage.name
      ? '.'
      : `.${id.slice(workspacePackage.name.length)}`;
  const sourceImport = resolveManifestImport(
    workspacePackage.root,
    workspacePackage.manifest,
    subpath,
  );
  if (sourceImport) {
    return sourceImport;
  }

  for (const buildDir of getWorkspacePackageBuildDirs(workspacePackage)) {
    if (!existsSync(buildDir)) {
      continue;
    }

    const manifestPath = resolve(buildDir, 'package.json');
    if (!existsSync(manifestPath)) {
      continue;
    }

    const builtImport = resolveManifestImport(
      buildDir,
      readPackageManifest(manifestPath),
      subpath,
    );
    if (builtImport) {
      return builtImport;
    }
  }

  throw new Error(`Unable to resolve workspace export ${id}`);
}

function analogWorkspaceResolver(): Plugin {
  return {
    name: 'analog-workspace-resolver',
    resolveId(id) {
      return resolveWorkspaceAnalogImport(id);
    },
  };
}

function isFixtureSupported(requiredImports: string[]): boolean {
  return requiredImports.every((id) => {
    try {
      const resolved = resolveWorkspaceAnalogImport(id);
      return !!resolved && existsSync(resolved);
    } catch {
      return false;
    }
  });
}

async function measureRuntimeFixtures(): Promise<RuntimeFixtureMeasurement[]> {
  const tempDir = mkdtempSync(join(tmpdir(), 'analog-bundle-size-'));

  try {
    const results: RuntimeFixtureMeasurement[] = [];

    for (const fixture of runtimeFixtures) {
      if (!isFixtureSupported(fixture.requiredImports)) {
        continue;
      }

      const outputDir = join(tempDir, fixture.id);
      const buildResult = await build({
        configFile: false,
        logLevel: 'silent',
        plugins: [analogWorkspaceResolver()],
        resolve: {
          preserveSymlinks: false,
        },
        build: {
          minify: 'esbuild',
          sourcemap: false,
          write: false,
          emptyOutDir: false,
          target: 'es2022',
          lib: {
            entry: fixture.entry,
            formats: ['es'],
            fileName: fixture.id,
          },
          rollupOptions: {
            external: bundleExternal,
            output: {
              dir: outputDir,
              hoistTransitiveImports: false,
            },
          },
        },
      });

      const outputs = Array.isArray(buildResult) ? buildResult : [buildResult];
      const emittedOutputs = outputs
        .filter(
          (
            result,
          ): result is Extract<
            (typeof outputs)[number],
            { output: unknown[] }
          > => 'output' in result,
        )
        .flatMap((result) => result.output)
        .filter(
          (
            item,
          ): item is Extract<
            (typeof outputs)[number]['output'][number],
            { type: 'chunk' | 'asset' }
          > => item.type === 'chunk' || item.type === 'asset',
        );

      if (emittedOutputs.length === 0) {
        throw new Error(`Missing bundle output for fixture ${fixture.id}`);
      }

      const { rawBytes, gzipBytes } = emittedOutputs.reduce(
        (totals, output) => {
          const contents =
            output.type === 'chunk'
              ? output.code
              : output.source === undefined
                ? output.fileName
                : Buffer.isBuffer(output.source) ||
                    output.source instanceof Uint8Array
                  ? Buffer.from(output.source)
                  : typeof output.source === 'string'
                    ? output.source
                    : JSON.stringify(output.source);
          const rawBytes = Buffer.byteLength(contents);

          return {
            rawBytes: totals.rawBytes + rawBytes,
            gzipBytes:
              totals.gzipBytes + gzipSync(contents, { level: 9 }).byteLength,
          };
        },
        { rawBytes: 0, gzipBytes: 0 },
      );

      results.push({
        id: fixture.id,
        label: fixture.label,
        entry: fixture.entry,
        rawBytes,
        gzipBytes,
      });
    }

    return results;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function parsePackResult(packageName: string, result: unknown): NpmPackResult {
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error(`npm pack did not return metadata for ${packageName}`);
  }

  const packResult = result[0];
  if (
    !packResult ||
    typeof packResult !== 'object' ||
    typeof packResult.filename !== 'string' ||
    typeof packResult.size !== 'number' ||
    typeof packResult.unpackedSize !== 'number'
  ) {
    throw new Error(`npm pack returned invalid metadata for ${packageName}`);
  }

  return packResult as NpmPackResult;
}

function categorizePackageArtifactFile(
  filePath: string,
): PackageArtifactFileCategory {
  if (filePath.endsWith('.js.map')) {
    return 'map';
  }

  if (filePath.endsWith('.d.ts')) {
    return 'typing';
  }

  if (
    filePath.endsWith('.js') ||
    filePath.endsWith('.mjs') ||
    filePath.endsWith('.cjs')
  ) {
    return 'js';
  }

  if (filePath.endsWith('.json')) {
    return 'json';
  }

  if (filePath.endsWith('.md')) {
    return 'markdown';
  }

  if (/\.(png|jpe?g|gif|svg|ico|woff2?|ttf)$/iu.test(filePath)) {
    return 'asset';
  }

  return 'other';
}

function measurePackageArtifactFiles(
  packResult: NpmPackResult,
): PackageArtifactFileMeasurement[] {
  if (!Array.isArray(packResult.files)) {
    return [];
  }

  return packResult.files
    .filter(
      (file): file is NpmPackFileResult =>
        !!file &&
        typeof file === 'object' &&
        typeof file.path === 'string' &&
        typeof file.size === 'number',
    )
    .map((file) => ({
      path: file.path,
      size: file.size,
      category: categorizePackageArtifactFile(file.path),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function resolvePublishDir(
  publishDir: string,
  packageName: string,
): string | null {
  const configuredDir = resolve(root, publishDir);
  if (existsSync(configuredDir)) {
    return configuredDir;
  }

  const nodeModulesDir = resolve(root, 'node_modules', packageName);
  if (existsSync(nodeModulesDir)) {
    return nodeModulesDir;
  }

  return null;
}

function measurePackageArtifacts(): PackageArtifactMeasurement[] {
  const outDir = mkdtempSync(join(tmpdir(), 'analog-pack-size-'));

  try {
    return packageArtifacts.flatMap((artifact) => {
      const publishDir = resolvePublishDir(
        artifact.publishDir,
        artifact.packageName,
      );

      if (!publishDir) {
        return [];
      }

      const raw = run(
        'npm',
        ['pack', '--pack-destination', outDir, '--json'],
        publishDir,
      );
      const packResult = parsePackResult(
        artifact.packageName,
        JSON.parse(raw) as unknown,
      );

      return [
        {
          projectName: artifact.projectName,
          packageName: artifact.packageName,
          publishDir: relative(root, publishDir) || '.',
          packedBytes: packResult.size,
          unpackedBytes: packResult.unpackedSize,
          fileCount: Array.isArray(packResult.files)
            ? packResult.files.length
            : 0,
          tarballFilename: packResult.filename,
          files: measurePackageArtifactFiles(packResult),
        },
      ];
    });
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function buildReleasePackages(): void {
  run(bundleSizeBuildCommand[0], [...bundleSizeBuildCommand.slice(1)]);
}

async function createSnapshot(): Promise<BundleSizeSnapshot> {
  if (!hasFlag('skip-build')) {
    buildReleasePackages();
  }

  const label = getOption('label') ?? getGitBranch();
  const branch = getOption('git-branch') ?? getGitBranch();

  return {
    generatedAt: new Date().toISOString(),
    label,
    workspaceRoot: root,
    git: {
      branch: branch === 'HEAD' ? label : branch,
      sha: getGitSha(),
    },
    runtimeFixtures: await measureRuntimeFixtures(),
    packageArtifacts: measurePackageArtifacts(),
  };
}

const program = Effect.gen(function* () {
  const snapshot = yield* Effect.tryPromise({
    try: () => createSnapshot(),
    catch: (error) =>
      error instanceof Error ? error : new Error(String(error)),
  });
  const outputPath = resolve(
    root,
    getOption('json-output') ?? defaultOutputPath,
  );

  yield* Effect.sync(() => {
    ensureDir(outputPath);
    writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

    if (hasFlag('print')) {
      process.stdout.write(readFileSync(outputPath, 'utf8'));
    } else {
      process.stdout.write(`${outputPath}\n`);
    }
  });
});

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
