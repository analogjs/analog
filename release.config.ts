import type { GlobalConfig } from 'semantic-release';

const tag = process.env['RELEASE_TAG'];

const versionFiles = [
  'package.json',
  'packages/astro-angular/package.json',
  'packages/content/package.json',
  'packages/create-analog/package.json',
  'packages/platform/package.json',
  'packages/router/package.json',
  'packages/storybook-angular/package.json',
  'packages/vite-plugin-angular/package.json',
  'packages/vite-plugin-nitro/package.json',
  'packages/vitest-angular/package.json',
];

const replacementFiles = [
  'packages/create-analog/template-angular-v17/package.json',
  'packages/create-analog/template-angular-v18/package.json',
  'packages/create-analog/template-angular-v19/package.json',
  'packages/create-analog/template-angular-v20/package.json',
  'packages/create-analog/template-blog/package.json',
  'packages/create-analog/template-latest/package.json',
  'packages/create-analog/template-minimal/package.json',
];

export default {
  branches: [
    'main',
    { name: 'beta', prerelease: true },
    { name: 'alpha', prerelease: true },
  ],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    [
      '@semantic-release/github',
      {
        successComment: false,
      },
    ],
    [
      'semantic-release-replace-plugin',
      {
        replacements: [
          {
            files: versionFiles,
            from: '"version": ".*"',
            to: '"version": "${nextRelease.version}"',
            countMatches: true,
          },
        ],
      },
    ],
    [
      'semantic-release-replace-plugin',
      {
        replacements: [
          {
            files: replacementFiles,
            from: '"@analogjs/vite-plugin-angular": ".*"',
            to: '"@analogjs/vite-plugin-angular": "^${nextRelease.version}"',
          },
          {
            files: replacementFiles,
            from: '"@analogjs/vitest-angular": ".*"',
            to: '"@analogjs/vitest-angular": "^${nextRelease.version}"',
          },
          {
            files: replacementFiles,
            from: '"@analogjs/vite-plugin-nitro": ".*"',
            to: '"@analogjs/vite-plugin-nitro": "^${nextRelease.version}"',
          },
          {
            files: replacementFiles,
            from: '"@analogjs/platform": ".*"',
            to: '"@analogjs/platform": "^${nextRelease.version}"',
          },
          {
            files: replacementFiles,
            from: '"@analogjs/content": ".*"',
            to: '"@analogjs/content": "^${nextRelease.version}"',
          },
          {
            files: replacementFiles,
            from: '"@analogjs/router": ".*"',
            to: '"@analogjs/router": "^${nextRelease.version}"',
          },
          {
            files: replacementFiles,
            from: '"@analogjs/angular-compiler": ".*"',
            to: '"@analogjs/angular-compiler": "^${nextRelease.version}"',
          },
        ],
      },
    ],
    [
      'semantic-release-replace-plugin',
      {
        replacements: [
          {
            files: [
              'packages/nx-plugin/src/generators/app/versions/nx_18_X/versions.ts',
              'packages/nx-plugin/src/utils/versions/ng_19_X/versions.ts',
            ],
            from: "ANALOG_JS_ROUTER = '.*'",
            to: "ANALOG_JS_ROUTER = '^${nextRelease.version}'",
          },
          {
            files: [
              'packages/nx-plugin/src/generators/app/versions/nx_18_X/versions.ts',
              'packages/nx-plugin/src/utils/versions/ng_19_X/versions.ts',
            ],
            from: "ANALOG_JS_CONTENT = '.*'",
            to: "ANALOG_JS_CONTENT = '^${nextRelease.version}'",
          },
          {
            files: [
              'packages/nx-plugin/src/generators/app/versions/nx_18_X/versions.ts',
              'packages/nx-plugin/src/utils/versions/ng_19_X/versions.ts',
            ],
            from: "ANALOG_JS_PLATFORM = '.*'",
            to: "ANALOG_JS_PLATFORM = '^${nextRelease.version}'",
          },
          {
            files: [
              'packages/nx-plugin/src/generators/app/versions/nx_18_X/versions.ts',
              'packages/nx-plugin/src/utils/versions/ng_19_X/versions.ts',
              'packages/vitest-angular-tools/src/schematics/utils/versions.ts',
            ],
            from: "ANALOG_JS_VITE_PLUGIN_ANGULAR = '.*'",
            to: "ANALOG_JS_VITE_PLUGIN_ANGULAR = '^${nextRelease.version}'",
          },
          {
            files: [
              'packages/nx-plugin/src/generators/app/versions/nx_18_X/versions.ts',
              'packages/nx-plugin/src/utils/versions/ng_19_X/versions.ts',
            ],
            from: "ANALOG_JS_VITEST_ANGULAR = '.*'",
            to: "ANALOG_JS_VITEST_ANGULAR = '^${nextRelease.version}'",
          },
        ],
      },
    ],
    [
      '@semantic-release/exec',
      {
        publishCmd: `pnpm build:release && RELEASE_TAG=${tag} ./tools/publish.sh`,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: [
          'CHANGELOG.md',
          'package.json',
          'pnpm-lock.yaml',
          'packages/astro-angular/package.json',
          'packages/content/package.json',
          'packages/create-analog/package.json',
          'packages/create-analog/template-angular-v17/package.json',
          'packages/create-analog/template-angular-v18/package.json',
          'packages/create-analog/template-angular-v19/package.json',
          'packages/create-analog/template-angular-v20/package.json',
          'packages/create-analog/template-blog/package.json',
          'packages/create-analog/template-latest/package.json',
          'packages/create-analog/template-minimal/package.json',
          'packages/platform/package.json',
          'packages/router/package.json',
          'packages/storybook-angular/package.json',
          'packages/vite-plugin-angular/package.json',
          'packages/vite-plugin-nitro/package.json',
          'packages/vitest-angular/package.json',
          'packages/nx-plugin/src/generators/app/versions/nx_18_X/versions.ts',
          'packages/nx-plugin/src/utils/versions/ng_19_X/versions.ts',
          'packages/vitest-angular-tools/src/schematics/utils/versions.ts',
        ],
        message: 'chore: release ${nextRelease.version} [skip ci]',
      },
    ],
  ],
  preset: 'angular',
} satisfies GlobalConfig;
