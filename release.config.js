/**
 * @type {import('semantic-release').GlobalConfig}
 */
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
        pkgRoot: './packages/trpc/',
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
      '@semantic-release/git',
      {
        assets: [
          'CHANGELOG.md',
          'package.json',
          'packages/astro-angular/package.json',
          'packages/content/package.json',
          'packages/platform/package.json',
          'packages/router/package.json',
          'packages/trpc/package.json',
          'packages/vite-plugin-angular/package.json',
          'packages/vite-plugin-nitro/package.json',
        ],
        message: 'chore: release ${nextRelease.version} [skip ci]',
      },
    ],
    // [
    //   '@semantic-release/exec',
    //   {
    //     publishCmd: 'pnpm build --skip-nx-cache',
    //   },
    // ],
  ],
  preset: 'angular',
};
