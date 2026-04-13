export interface ReleaseArtifact {
  projectName: string;
  packageName: string;
  publishDir: string;
}

export const releaseArtifacts: ReleaseArtifact[] = [
  {
    projectName: 'angular-compiler',
    packageName: '@analogjs/angular-compiler',
    publishDir: 'packages/angular-compiler/dist',
  },  
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
