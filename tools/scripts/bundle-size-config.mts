import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseArtifacts } from './release-artifacts-config.mts';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export interface RuntimeFixtureConfig {
  id: string;
  label: string;
  entry: string;
  requiredImports: string[];
}

export interface PackageArtifactConfig {
  projectName: string;
  packageName: string;
  publishDir: string;
}

export const bundleSizeBuildCommand = [
  'pnpm',
  'exec',
  'nx',
  'run-many',
  '--target',
  'build',
  '--projects=tag:type:release',
] as const;

export const runtimeFixtures: RuntimeFixtureConfig[] = [
  {
    id: 'router-basic',
    label: '@analogjs/router',
    entry: resolve(scriptRoot, 'tools/bundle-size/fixtures/router-basic.ts'),
    requiredImports: ['@analogjs/router'],
  },
  {
    id: 'router-content',
    label: '@analogjs/router/content',
    entry: resolve(scriptRoot, 'tools/bundle-size/fixtures/router-content.ts'),
    requiredImports: ['@analogjs/router/content'],
  },
  {
    id: 'router-tanstack-query',
    label: '@analogjs/router/tanstack-query',
    entry: resolve(
      scriptRoot,
      'tools/bundle-size/fixtures/router-tanstack-query.ts',
    ),
    requiredImports: ['@analogjs/router/tanstack-query'],
  },
  {
    id: 'content-basic',
    label: '@analogjs/content',
    entry: resolve(scriptRoot, 'tools/bundle-size/fixtures/content-basic.ts'),
    requiredImports: ['@analogjs/content'],
  },
  {
    id: 'content-mdc',
    label: '@analogjs/content/mdc',
    entry: resolve(scriptRoot, 'tools/bundle-size/fixtures/content-mdc.ts'),
    requiredImports: ['@analogjs/content/mdc'],
  },
  {
    id: 'content-resources',
    label: '@analogjs/content/resources',
    entry: resolve(
      scriptRoot,
      'tools/bundle-size/fixtures/content-resources.ts',
    ),
    requiredImports: ['@analogjs/content/resources'],
  },
  {
    id: 'astro-angular-client',
    label: '@analogjs/astro-angular/client.js',
    entry: resolve(
      scriptRoot,
      'tools/bundle-size/fixtures/astro-angular-client.ts',
    ),
    requiredImports: ['@analogjs/astro-angular/client.js'],
  },
];

const packageArtifactProjects = new Set([
  'platform',
  'storybook-angular',
  'vite-plugin-angular',
  'vite-plugin-nitro',
  'vitest-angular',
  'create-analog',
]);

export const packageArtifacts: PackageArtifactConfig[] =
  releaseArtifacts.filter((artifact) =>
    packageArtifactProjects.has(artifact.projectName),
  );
