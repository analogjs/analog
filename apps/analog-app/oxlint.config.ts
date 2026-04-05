import { defineConfig } from 'oxlint';
import baseConfig from '../../oxlint.config.ts';

export default defineConfig({
  extends: [baseConfig],
  jsPlugins: [
    { name: '@angular-eslint', specifier: '@angular-eslint/eslint-plugin' },
    {
      name: '@angular-eslint/template',
      specifier: '@angular-eslint/eslint-plugin-template',
    },
    { name: 'storybook', specifier: 'eslint-plugin-storybook' },
  ],
  overrides: [
    {
      files: ['src/**/*.ts', 'src/**/*.tsx'],
      rules: {
        '@angular-eslint/directive-selector': [
          'error',
          {
            type: 'attribute',
            prefix: 'analogjs',
            style: 'camelCase',
          },
        ],
        '@angular-eslint/component-selector': [
          'error',
          {
            type: 'element',
            prefix: ['analogjs', 'app', 'storybook'],
            style: 'kebab-case',
          },
        ],
        '@angular-eslint/use-component-selector': 'error',
        '@angular-eslint/prefer-standalone': 'error',
      },
    },
    {
      files: ['src/**/pages/**/*.ts', 'src/**/*.page.ts', 'src/**/*.page.tsx'],
      rules: {
        '@angular-eslint/use-component-selector': 'off',
      },
    },
    {
      files: ['src/stories/**/*.ts', 'src/stories/**/*.tsx'],
      rules: {
        '@angular-eslint/no-output-on-prefix': 'off',
        '@angular-eslint/template/prefer-control-flow': 'off',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          {
            disallowTypeAnnotations: false,
          },
        ],
      },
    },
  ],
});
