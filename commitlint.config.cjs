module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    'scope-enum': [
      2,
      'always',
      [
        'vite-plugin-angular',
        'vite-plugin-nitro',
        'vitest-angular',
        'create-analog',
        'astro-angular',
        'router',
        'platform',
        'content',
        'nx-plugin',
        'trpc',
      ],
    ],
  },
};
