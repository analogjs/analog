#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { groupBy, keyBy, orderBy, sumBy } from 'es-toolkit';
import { Effect } from 'effect';

import {
  packageArtifacts as packageArtifactConfig,
  runtimeFixtures as runtimeFixtureConfig,
} from './bundle-size-config.mts';

interface RuntimeFixtureMeasurement {
  id: string;
  label: string;
  entry: string;
  rawBytes: number;
  gzipBytes: number;
}

type PackageArtifactFileCategory =
  | 'asset'
  | 'js'
  | 'json'
  | 'map'
  | 'markdown'
  | 'other'
  | 'typing';

interface PackageArtifactFileMeasurement {
  path: string;
  size: number;
  category: PackageArtifactFileCategory;
}

interface PackageArtifactMeasurement {
  projectName: string;
  packageName: string;
  publishDir: string;
  packedBytes: number;
  unpackedBytes: number;
  fileCount: number;
  tarballFilename: string;
  files?: PackageArtifactFileMeasurement[];
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

interface BaselineInput {
  label: string;
  path: string;
}

type FileComparisonStatus = 'baseline-only' | 'current-only' | 'matched';

interface ComparedPackageFile {
  path: string;
  category: PackageArtifactFileCategory;
  status: FileComparisonStatus;
  currentSize?: number;
  baselineSize?: number;
  deltaBytes?: number;
}

interface FileCategoryComparison {
  category: PackageArtifactFileCategory;
  matchedCount: number;
  matchedCurrentBytes: number;
  matchedBaselineBytes: number;
  currentOnlyCount: number;
  currentOnlyBytes: number;
  baselineOnlyCount: number;
  baselineOnlyBytes: number;
}

interface PackageFileComparison {
  packageName: string;
  current: PackageArtifactMeasurement | undefined;
  baseline: PackageArtifactMeasurement | undefined;
  matchedFiles: number;
  currentOnlyFiles: number;
  baselineOnlyFiles: number;
  categories: FileCategoryComparison[];
  topMatchedDelta: ComparedPackageFile[];
  topCurrentOnly: ComparedPackageFile[];
  topBaselineOnly: ComparedPackageFile[];
}

interface BaselineComparison {
  baseline: BundleSizeSnapshot;
  packageComparisons: PackageFileComparison[];
}

const fileCategoryOrder: PackageArtifactFileCategory[] = [
  'js',
  'map',
  'typing',
  'json',
  'markdown',
  'asset',
  'other',
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultCurrentPath = resolve(
  root,
  'tmp/bundle-size/current/snapshot.json',
);
const defaultMarkdownPath = resolve(root, 'tmp/bundle-size/report.md');
const defaultJsonPath = resolve(root, 'tmp/bundle-size/compare.json');

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

function getOptions(name: string): string[] {
  const flag = `--${name}`;
  const results: string[] = [];

  for (let index = 0; index < process.argv.length; index++) {
    if (process.argv[index] !== flag) {
      continue;
    }

    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }

    results.push(value);
  }

  return results;
}

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function readSnapshot(path: string): BundleSizeSnapshot {
  return JSON.parse(readFileSync(path, 'utf8')) as BundleSizeSnapshot;
}

function readSnapshotEffect(path: string) {
  return Effect.try({
    try: () => readSnapshot(path),
    catch: (error) =>
      error instanceof Error ? error : new Error(String(error)),
  });
}

function parseBaselineInput(value: string): BaselineInput {
  const separatorIndex = value.indexOf('=');
  if (separatorIndex === -1) {
    const path = resolve(root, value);
    return {
      label: basename(path).replace(/\.json$/u, '') || 'baseline',
      path,
    };
  }

  return {
    label: value.slice(0, separatorIndex),
    path: resolve(root, value.slice(separatorIndex + 1)),
  };
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) {
    return 'n/a';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} kB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDelta(
  current: number | undefined,
  baseline: number | undefined,
): string {
  if (current === undefined || baseline === undefined) {
    return 'n/a';
  }

  const delta = current - baseline;
  const sign = delta > 0 ? '+' : '';
  if (baseline === 0) {
    return `${sign}${formatBytes(delta)}`;
  }

  const percent = ((delta / baseline) * 100).toFixed(1);
  return `${sign}${formatBytes(delta)} (${sign}${percent}%)`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/gu, '\\|');
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function formatCoverage(measured: number, expected: number): string {
  return `${measured}/${expected}`;
}

function buildCoverageNotes(baselines: BundleSizeSnapshot[]): string[] {
  return baselines.map((baseline) => {
    const runtimeCoverage = formatCoverage(
      baseline.runtimeFixtures.length,
      runtimeFixtureConfig.length,
    );
    const packageCoverage = formatCoverage(
      baseline.packageArtifacts.length,
      packageArtifactConfig.length,
    );

    return `- ${escapeCell(baseline.label)}: runtime ${runtimeCoverage}, package artifacts ${packageCoverage}`;
  });
}

function formatPackageFileCoverage(
  currentFiles: PackageArtifactFileMeasurement[],
  baselineFiles: PackageArtifactFileMeasurement[],
): Pick<
  PackageFileComparison,
  | 'matchedFiles'
  | 'currentOnlyFiles'
  | 'baselineOnlyFiles'
  | 'categories'
  | 'topMatchedDelta'
  | 'topCurrentOnly'
  | 'topBaselineOnly'
> {
  const currentByPath = keyBy(currentFiles, (file) => file.path);
  const baselineByPath = keyBy(baselineFiles, (file) => file.path);
  const allPaths = [
    ...new Set([...Object.keys(currentByPath), ...Object.keys(baselineByPath)]),
  ];

  const comparedFiles = allPaths.map<ComparedPackageFile>((filePath) => {
    const currentFile = currentByPath[filePath];
    const baselineFile = baselineByPath[filePath];
    const category = currentFile?.category ?? baselineFile?.category ?? 'other';
    const status: FileComparisonStatus =
      currentFile && baselineFile
        ? 'matched'
        : currentFile
          ? 'current-only'
          : 'baseline-only';

    return {
      path: filePath,
      category,
      status,
      currentSize: currentFile?.size,
      baselineSize: baselineFile?.size,
      deltaBytes:
        currentFile && baselineFile
          ? currentFile.size - baselineFile.size
          : undefined,
    };
  });

  const groupedByCategory = groupBy(comparedFiles, (file) => file.category);
  const categories = fileCategoryOrder.map<FileCategoryComparison>(
    (category) => {
      const files = groupedByCategory[category] ?? [];
      const matched = files.filter((file) => file.status === 'matched');
      const currentOnly = files.filter(
        (file) => file.status === 'current-only',
      );
      const baselineOnly = files.filter(
        (file) => file.status === 'baseline-only',
      );

      return {
        category,
        matchedCount: matched.length,
        matchedCurrentBytes: sumBy(matched, (file) => file.currentSize ?? 0),
        matchedBaselineBytes: sumBy(matched, (file) => file.baselineSize ?? 0),
        currentOnlyCount: currentOnly.length,
        currentOnlyBytes: sumBy(currentOnly, (file) => file.currentSize ?? 0),
        baselineOnlyCount: baselineOnly.length,
        baselineOnlyBytes: sumBy(
          baselineOnly,
          (file) => file.baselineSize ?? 0,
        ),
      };
    },
  );

  return {
    matchedFiles: comparedFiles.filter((file) => file.status === 'matched')
      .length,
    currentOnlyFiles: comparedFiles.filter(
      (file) => file.status === 'current-only',
    ).length,
    baselineOnlyFiles: comparedFiles.filter(
      (file) => file.status === 'baseline-only',
    ).length,
    categories,
    topMatchedDelta: orderBy(
      comparedFiles.filter(
        (file) => file.status === 'matched' && file.deltaBytes !== 0,
      ),
      [(file) => Math.abs(file.deltaBytes ?? 0), (file) => file.path],
      ['desc', 'asc'],
    ).slice(0, 8),
    topCurrentOnly: orderBy(
      comparedFiles.filter((file) => file.status === 'current-only'),
      [(file) => file.currentSize ?? 0, (file) => file.path],
      ['desc', 'asc'],
    ).slice(0, 8),
    topBaselineOnly: orderBy(
      comparedFiles.filter((file) => file.status === 'baseline-only'),
      [(file) => file.baselineSize ?? 0, (file) => file.path],
      ['desc', 'asc'],
    ).slice(0, 8),
  };
}

function buildRuntimeRows(
  current: BundleSizeSnapshot,
  baselines: BundleSizeSnapshot[],
): string[] {
  const currentById = keyBy(current.runtimeFixtures, (fixture) => fixture.id);
  const baselinesById = baselines.map((baseline) =>
    keyBy(baseline.runtimeFixtures, (fixture) => fixture.id),
  );

  return runtimeFixtureConfig.map((fixture) => {
    const cells = [escapeCell(fixture.label)];
    const currentFixture = currentById[fixture.id];
    cells.push(formatBytes(currentFixture?.gzipBytes));

    for (const baselineById of baselinesById) {
      const baselineFixture = baselineById[fixture.id];
      cells.push(formatBytes(baselineFixture?.gzipBytes));
      cells.push(
        formatDelta(currentFixture?.gzipBytes, baselineFixture?.gzipBytes),
      );
    }

    return `| ${cells.join(' | ')} |`;
  });
}

function buildPackageRows(
  current: BundleSizeSnapshot,
  baselines: BundleSizeSnapshot[],
): string[] {
  const currentByName = keyBy(
    current.packageArtifacts,
    (artifact) => artifact.packageName,
  );
  const baselinesByName = baselines.map((baseline) =>
    keyBy(baseline.packageArtifacts, (artifact) => artifact.packageName),
  );

  return packageArtifactConfig.map((artifact) => {
    const cells = [escapeCell(artifact.packageName)];
    const currentPackage = currentByName[artifact.packageName];
    cells.push(formatBytes(currentPackage?.packedBytes));
    cells.push(formatBytes(currentPackage?.unpackedBytes));

    for (const baselineByName of baselinesByName) {
      const baselinePackage = baselineByName[artifact.packageName];
      cells.push(formatBytes(baselinePackage?.packedBytes));
      cells.push(
        formatDelta(currentPackage?.packedBytes, baselinePackage?.packedBytes),
      );
      cells.push(formatBytes(baselinePackage?.unpackedBytes));
      cells.push(
        formatDelta(
          currentPackage?.unpackedBytes,
          baselinePackage?.unpackedBytes,
        ),
      );
    }

    return `| ${cells.join(' | ')} |`;
  });
}

function buildBaselineComparisons(
  current: BundleSizeSnapshot,
  baselines: BundleSizeSnapshot[],
): BaselineComparison[] {
  const currentByPackage = keyBy(
    current.packageArtifacts,
    (artifact) => artifact.packageName,
  );

  return baselines.map((baseline) => {
    const baselineByPackage = keyBy(
      baseline.packageArtifacts,
      (artifact) => artifact.packageName,
    );

    return {
      baseline,
      packageComparisons: packageArtifactConfig.map((artifact) => {
        const currentArtifact = currentByPackage[artifact.packageName];
        const baselineArtifact = baselineByPackage[artifact.packageName];
        const currentFiles = currentArtifact?.files ?? [];
        const baselineFiles = baselineArtifact?.files ?? [];

        return {
          packageName: artifact.packageName,
          current: currentArtifact,
          baseline: baselineArtifact,
          ...formatPackageFileCoverage(currentFiles, baselineFiles),
        };
      }),
    };
  });
}

function buildPackageFileCoverageRows(
  comparison: BaselineComparison,
): string[] {
  return comparison.packageComparisons.map((packageComparison) => {
    const currentFiles = packageComparison.current?.fileCount ?? 0;
    const baselineFiles = packageComparison.baseline?.fileCount ?? 0;
    return `| ${escapeCell(packageComparison.packageName)} | ${packageComparison.matchedFiles} | ${packageComparison.currentOnlyFiles} | ${packageComparison.baselineOnlyFiles} | ${currentFiles} | ${baselineFiles} |`;
  });
}

function buildCategoryRows(packageComparison: PackageFileComparison): string[] {
  return packageComparison.categories.map((category) => {
    const matchedDelta =
      category.matchedCurrentBytes - category.matchedBaselineBytes;
    return `| ${category.category} | ${category.matchedCount} | ${formatBytes(category.matchedCurrentBytes)} | ${formatBytes(category.matchedBaselineBytes)} | ${formatBytes(matchedDelta)} | ${category.currentOnlyCount} | ${formatBytes(category.currentOnlyBytes)} | ${category.baselineOnlyCount} | ${formatBytes(category.baselineOnlyBytes)} |`;
  });
}

function buildFileRows(
  files: ComparedPackageFile[],
  baselineLabel: string,
): string[] {
  if (files.length === 0) {
    return ['| none | - | - | - | - |'];
  }

  return files.map((file) => {
    const delta =
      file.deltaBytes === undefined ? 'n/a' : formatBytes(file.deltaBytes);
    return `| ${escapeCell(file.path)} | ${file.category} | ${formatBytes(file.currentSize)} | ${formatBytes(file.baselineSize)} | ${delta === 'n/a' ? `n/a vs ${escapeCell(baselineLabel)}` : delta} |`;
  });
}

function buildSingleBranchFileRows(
  files: ComparedPackageFile[],
  side: 'baseline' | 'current',
): string[] {
  if (files.length === 0) {
    return ['| none | - | - |'];
  }

  return files.map((file) => {
    return `| ${escapeCell(file.path)} | ${file.category} | ${formatBytes(side === 'current' ? file.currentSize : file.baselineSize)} |`;
  });
}

function buildDetailedPackageSections(
  comparisons: BaselineComparison[],
): string[] {
  const lines: string[] = ['### Package Artifact File Comparisons', ''];

  for (const comparison of comparisons) {
    const baselineLabel = escapeCell(comparison.baseline.label);

    lines.push(`#### File Coverage vs ${baselineLabel}`, '');
    lines.push(
      '| Package | matched | current-only | baseline-only | current files | baseline files |',
      '| --- | ---: | ---: | ---: | ---: | ---: |',
      ...buildPackageFileCoverageRows(comparison),
      '',
    );

    for (const packageComparison of comparison.packageComparisons) {
      lines.push(
        `#### ${escapeCell(packageComparison.packageName)} vs ${baselineLabel}`,
        '',
        '| Metric | current | baseline | delta current-baseline |',
        '| --- | ---: | ---: | ---: |',
        `| packed | ${formatBytes(packageComparison.current?.packedBytes)} | ${formatBytes(packageComparison.baseline?.packedBytes)} | ${formatDelta(packageComparison.current?.packedBytes, packageComparison.baseline?.packedBytes)} |`,
        `| unpacked | ${formatBytes(packageComparison.current?.unpackedBytes)} | ${formatBytes(packageComparison.baseline?.unpackedBytes)} | ${formatDelta(packageComparison.current?.unpackedBytes, packageComparison.baseline?.unpackedBytes)} |`,
        `| file count | ${packageComparison.current?.fileCount ?? 0} | ${packageComparison.baseline?.fileCount ?? 0} | ${(packageComparison.current?.fileCount ?? 0) - (packageComparison.baseline?.fileCount ?? 0)} |`,
        '',
        '| Category | matched files | current matched bytes | baseline matched bytes | matched delta | current-only files | current-only bytes | baseline-only files | baseline-only bytes |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        ...buildCategoryRows(packageComparison),
        '',
        'Top matched file deltas:',
        '',
        '| path | category | current | baseline | delta |',
        '| --- | --- | ---: | ---: | ---: |',
        ...buildFileRows(
          packageComparison.topMatchedDelta,
          comparison.baseline.label,
        ),
        '',
        'Top current-only files:',
        '',
        '| path | category | current size |',
        '| --- | --- | ---: |',
        ...buildSingleBranchFileRows(
          packageComparison.topCurrentOnly,
          'current',
        ),
        '',
        `Top ${baselineLabel}-only files:`,
        '',
        '| path | category | baseline size |',
        '| --- | --- | ---: |',
        ...buildSingleBranchFileRows(
          packageComparison.topBaselineOnly,
          'baseline',
        ),
        '',
      );
    }
  }

  return lines;
}

function buildMarkdown(
  current: BundleSizeSnapshot,
  baselines: BundleSizeSnapshot[],
): string {
  const currentLabel = escapeCell(current.label);
  const runtimeHeader = ['Fixture', `${currentLabel} gzip`];
  const packageHeader = [
    'Package',
    `${currentLabel} packed`,
    `${currentLabel} unpacked`,
  ];

  for (const baseline of baselines) {
    const baselineLabel = escapeCell(baseline.label);
    runtimeHeader.push(`${baselineLabel} gzip`, `delta vs ${baselineLabel}`);
    packageHeader.push(
      `${baselineLabel} packed`,
      `packed delta vs ${baselineLabel}`,
      `${baselineLabel} unpacked`,
      `unpacked delta vs ${baselineLabel}`,
    );
  }

  const measuredRefs = [
    `- ${currentLabel}: \`${escapeCell(current.git.branch)}\` @ \`${shortSha(current.git.sha)}\``,
    ...baselines.map(
      (baseline) =>
        `- ${escapeCell(baseline.label)}: \`${escapeCell(baseline.git.branch)}\` @ \`${shortSha(baseline.git.sha)}\``,
    ),
  ];
  const baselineComparisons = buildBaselineComparisons(current, baselines);

  return [
    '<!-- bundle-size-report -->',
    '## Bundle Size Analysis',
    '',
    'Measured refs:',
    ...measuredRefs,
    '',
    'Baseline coverage:',
    ...buildCoverageNotes(baselines),
    '',
    '### Runtime Bundle Fixtures',
    '',
    `| ${runtimeHeader.join(' | ')} |`,
    `| ${runtimeHeader.map(() => '---').join(' | ')} |`,
    ...buildRuntimeRows(current, baselines),
    '',
    '### Package Artifact Sizes',
    '',
    `| ${packageHeader.join(' | ')} |`,
    `| ${packageHeader.map(() => '---').join(' | ')} |`,
    ...buildPackageRows(current, baselines),
    '',
    ...buildDetailedPackageSections(baselineComparisons),
    `_Generated ${current.generatedAt}_`,
    '',
  ].join('\n');
}

const program = Effect.gen(function* () {
  const currentSnapshot = yield* readSnapshotEffect(
    resolve(root, getOption('current') ?? defaultCurrentPath),
  );
  const baselineSnapshots = yield* Effect.forEach(
    getOptions('baseline').map(parseBaselineInput),
    ({ label, path }) =>
      Effect.map(readSnapshotEffect(path), (snapshot) => ({
        ...snapshot,
        label,
      })),
  );

  if (baselineSnapshots.length === 0) {
    return yield* Effect.fail(
      new Error('At least one --baseline <label=path> is required'),
    );
  }

  const markdown = buildMarkdown(currentSnapshot, baselineSnapshots);
  const markdownOutputPath = resolve(
    root,
    getOption('markdown-output') ?? defaultMarkdownPath,
  );
  const jsonOutputPath = resolve(
    root,
    getOption('json-output') ?? defaultJsonPath,
  );

  yield* Effect.sync(() => {
    ensureDir(markdownOutputPath);
    writeFileSync(markdownOutputPath, `${markdown}\n`);

    ensureDir(jsonOutputPath);
    writeFileSync(
      jsonOutputPath,
      `${JSON.stringify(
        {
          current: currentSnapshot,
          baselines: baselineSnapshots,
          markdownPath: markdownOutputPath,
        },
        null,
        2,
      )}\n`,
    );

    process.stdout.write(`${markdownOutputPath}\n`);
  });
});

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
