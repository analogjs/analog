module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    'scope-enum': [2, 'always', ['vite-angular-plugin', 'create-analog']],
  },
};
