#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ReleaseArtifact {
  projectName: string;
  packageName: string;
  publishDir: string;
}

interface PackedArtifact extends ReleaseArtifact {
  filename: string;
  tarballPath: string;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const releaseArtifacts: ReleaseArtifact[] = [
  {
    projectName: 'astro-angular',
    packageName: '@analogjs/astro-angular',
    publishDir: 'packages/astro-angular/dist',
  },
  {
    projectName: 'content',
    packageName: '@analogjs/content',
    publishDir: 'packages/content/dist',
  },
  {
    projectName: 'platform',
    packageName: '@analogjs/platform',
    publishDir: 'packages/platform/dist',
  },
  {
    projectName: 'router',
    packageName: '@analogjs/router',
    publishDir: 'packages/router/dist',
  },
  {
    projectName: 'storybook-angular',
    packageName: '@analogjs/storybook-angular',
    publishDir: 'packages/storybook-angular/dist',
  },
  {
    projectName: 'vite-plugin-angular',
    packageName: '@analogjs/vite-plugin-angular',
    publishDir: 'packages/vite-plugin-angular/dist',
  },
  {
    projectName: 'vite-plugin-nitro',
    packageName: '@analogjs/vite-plugin-nitro',
    publishDir: 'packages/vite-plugin-nitro/dist',
  },
  {
    projectName: 'vitest-angular',
    packageName: '@analogjs/vitest-angular',
    publishDir: 'packages/vitest-angular/dist',
  },
  {
    projectName: 'create-analog',
    packageName: 'create-analog',
    publishDir: 'dist/packages/create-analog',
  },
];

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

function run(command: string, args: string[], cwd = root): void {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
}

function runJson(command: string, args: string[], cwd = root): unknown {
  const output = execFileSync(command, args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
  });

  return JSON.parse(output);
}

function getPublishTag(): string {
  return getOption('tag') ?? process.env['RELEASE_TAG'] ?? 'release-smoke';
}

function verifyReleaseArtifacts(): void {
  if (!hasFlag('skip-build')) {
    run('pnpm', ['run', 'build:release']);
  }

  run('node', ['tools/scripts/verify-package-artifacts.mts']);

  const tag = getPublishTag();
  for (const artifact of releaseArtifacts) {
    run(
      'npm',
      ['publish', '--tag', tag, '--dry-run', '--provenance=false'],
      resolve(root, artifact.publishDir),
    );
  }
}

function packReleaseArtifacts(): void {
  const outDir = resolve(root, getOption('out-dir') ?? 'tmp/release-artifacts');
  const jsonOutput = getOption('json-output');

  if (!hasFlag('skip-clean')) {
    rmSync(outDir, { recursive: true, force: true });
  }

  mkdirSync(outDir, { recursive: true });

  const packedArtifacts: PackedArtifact[] = releaseArtifacts.map((artifact) => {
    const result = runJson(
      'npm',
      ['pack', '--pack-destination', outDir, '--json'],
      resolve(root, artifact.publishDir),
    );

    if (!Array.isArray(result) || result.length === 0) {
      throw new Error(
        `npm pack did not return metadata for ${artifact.packageName}`,
      );
    }

    const packResult = result[0];
    if (
      !packResult ||
      typeof packResult !== 'object' ||
      typeof packResult.filename !== 'string'
    ) {
      throw new Error(
        `npm pack returned invalid metadata for ${artifact.packageName}`,
      );
    }

    return {
      ...artifact,
      filename: packResult.filename,
      tarballPath: resolve(outDir, packResult.filename),
    };
  });

  const json = JSON.stringify(packedArtifacts, null, 2);
  if (jsonOutput) {
    const outputPath = resolve(root, jsonOutput);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${json}\n`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

function publishReleaseArtifacts(): void {
  const tag = getPublishTag();

  for (const artifact of releaseArtifacts) {
    run('npm', ['publish', '--tag', tag], resolve(root, artifact.publishDir));
  }
}

function listReleaseArtifacts(): void {
  process.stdout.write(`${JSON.stringify(releaseArtifacts, null, 2)}\n`);
}

const action = process.argv[2];

switch (action) {
  case 'verify':
    verifyReleaseArtifacts();
    break;
  case 'pack':
    packReleaseArtifacts();
    break;
  case 'publish':
    publishReleaseArtifacts();
    break;
  case 'list':
    listReleaseArtifacts();
    break;
  default:
    throw new Error(
      'Usage: node tools/scripts/release-artifacts.mts <verify|pack|publish|list> [options]',
    );
}
