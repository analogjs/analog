/**
 * @type {import('semantic-release').GlobalConfig}
 */

const tag = process.env.RELEASE_TAG;

const replacementFiles = [
  'packages/astro-angular/package.json',
  'packages/create-analog/template-angular-v17/package.json',
  'packages/create-analog/template-blog/package.json',
  'packages/create-analog/template-latest/package.json',
  'packages/platform/package.json',
  'packages/router/package.json',
];

module.exports = {
  branches: ['main', { name: 'beta', prerelease: true }],
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
      '@semantic-release/npm',
      {
        npmPublish: false,
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: './packages/astro-angular/',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: './packages/content/',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: './packages/create-analog/',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: './packages/platform/',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: './packages/router/',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: './packages/vite-plugin-angular/',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: './packages/vite-plugin-nitro/',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: './packages/vitest-angular/',
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
        ],
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: [
          'CHANGELOG.md',
          'package.json',
          'packages/astro-angular/package.json',
          'packages/content/package.json',
          'packages/create-analog/package.json',
          'packages/create-analog/template-angular-v17/package.json',
          'packages/create-analog/template-blog/package.json',
          'packages/create-analog/template-latest/package.json',
          'packages/platform/package.json',
          'packages/router/package.json',
          'packages/vite-plugin-angular/package.json',
          'packages/vite-plugin-nitro/package.json',
          'packages/vitest-angular/package.json',
        ],
        message: 'chore: release ${nextRelease.version} [skip ci]',
      },
    ],
    [
      '@semantic-release/exec',
      {
        publishCmd: `pnpm build && RELEASE_TAG=${tag} ./tools/publish.sh`,
      },
    ],
  ],
  preset: 'angular',
};
