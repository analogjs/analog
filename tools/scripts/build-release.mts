#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

type Step = {
  label: string;
  command: string;
  args: string[];
};

const steps: Step[] = [
  {
    label: 'angular-compiler:build-self',
    command: 'pnpm',
    args: [
      'exec',
      'vite',
      'build',
      '--config',
      'packages/angular-compiler/vite.config.lib.ts',
    ],
  },  
  {
    label: 'vite-plugin-angular:build-self',
    command: 'pnpm',
    args: [
      'exec',
      'vite',
      'build',
      '--config',
      'packages/vite-plugin-angular/vite.config.lib.ts',
    ],
  },
  {
    label: 'vite-plugin-angular-tools:build',
    command: 'pnpm',
    args: [
      'exec',
      'vite',
      'build',
      '-c',
      'packages/vite-plugin-angular-tools/vite.config.lib.ts',
    ],
  },
  {
    label: 'vite-plugin-angular:verify',
    command: 'node',
    args: ['tools/scripts/verify-package-artifacts.mts', 'vite-plugin-angular'],
  },
  {
    label: 'vite-plugin-nitro:build',
    command: 'pnpm',
    args: [
      'exec',
      'vite',
      'build',
      '-c',
      'packages/vite-plugin-nitro/vite.config.lib.ts',
    ],
  },
  {
    label: 'vite-plugin-nitro:verify',
    command: 'node',
    args: ['tools/scripts/verify-package-artifacts.mts', 'vite-plugin-nitro'],
  },
  {
    label: 'vitest-angular:build-self',
    command: 'pnpm',
    args: [
      'exec',
      'vite',
      'build',
      '--config',
      'packages/vitest-angular/vite.config.lib.ts',
    ],
  },
  {
    label: 'vitest-angular-tools:build',
    command: 'pnpm',
    args: [
      'exec',
      'vite',
      'build',
      '-c',
      'packages/vitest-angular-tools/vite.config.lib.ts',
    ],
  },
  {
    label: 'vitest-angular:verify',
    command: 'node',
    args: ['tools/scripts/verify-package-artifacts.mts', 'vitest-angular'],
  },
  {
    label: 'storybook-angular:build',
    command: 'pnpm',
    args: [
      'exec',
      'vite',
      'build',
      '-c',
      'packages/storybook-angular/vite.config.lib.ts',
    ],
  },
  {
    label: 'storybook-angular:verify',
    command: 'node',
    args: ['tools/scripts/verify-package-artifacts.mts', 'storybook-angular'],
  },
  {
    label: 'astro-angular:build',
    command: 'pnpm',
    args: [
      'exec',
      'vite',
      'build',
      '-c',
      'packages/astro-angular/vite.config.lib.ts',
    ],
  },
  {
    label: 'astro-angular:verify',
    command: 'node',
    args: ['tools/scripts/verify-package-artifacts.mts', 'astro-angular'],
  },
  {
    label: 'create-analog:build',
    command: 'pnpm',
    args: [
      'exec',
      'cpy',
      '.',
      '!node_modules',
      '!project.json',
      '!__tests__',
      '!yarn.lock',
      '../../dist/packages/create-analog/',
      '--cwd',
      'packages/create-analog',
    ],
  },
  {
    label: 'create-analog:verify',
    command: 'node',
    args: ['tools/scripts/verify-package-artifacts.mts', 'create-analog'],
  },
  {
    label: 'content:assert-deps',
    command: 'node',
    args: [
      'tools/scripts/assert-project-dependency.mts',
      'content',
      'build-self',
      'vite-plugin-angular:build',
    ],
  },
  {
    label: 'content:build-self',
    command: 'node',
    args: ['tools/scripts/build-lib.mts', 'content'],
  },
  {
    label: 'content-plugin:build',
    command: 'pnpm',
    args: [
      'exec',
      'tsdown',
      '-c',
      'packages/content-plugin/tsdown.config.ts',
      '--config-loader',
      'unrun',
    ],
  },
  {
    label: 'content:verify',
    command: 'node',
    args: ['tools/scripts/verify-package-artifacts.mts', 'content'],
  },
  {
    label: 'router:build',
    command: 'node',
    args: ['tools/scripts/build-lib.mts', 'router'],
  },
  {
    label: 'router:verify',
    command: 'node',
    args: ['tools/scripts/verify-package-artifacts.mts', 'router'],
  },
  {
    label: 'platform:build-self',
    command: 'pnpm',
    args: [
      'exec',
      'vite',
      'build',
      '-c',
      'packages/platform/vite.config.lib.ts',
    ],
  },
  {
    label: 'nx-plugin:build',
    command: 'pnpm',
    args: [
      'exec',
      'vite',
      'build',
      '-c',
      'packages/nx-plugin/vite.config.lib.ts',
    ],
  },
  {
    label: 'platform:verify',
    command: 'node',
    args: ['tools/scripts/verify-package-artifacts.mts', 'platform'],
  },
];

function runStep(step: Step): void {
  process.stdout.write(`\n> ${step.label}\n`);
  execFileSync(step.command, step.args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
}

for (const step of steps) {
  runStep(step);
}
