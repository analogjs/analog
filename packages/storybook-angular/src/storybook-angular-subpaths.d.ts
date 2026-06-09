/**
 * Ambient declarations for `@storybook/angular` deep-import subpaths.
 *
 * As of `@storybook/angular@10.2.x` these subpath entry points ship as
 * `.js` without accompanying `.d.ts`, so `tsc` reports TS7016
 * ("could not find a declaration file for module …"). The runtime exports
 * are unchanged; these shims restore type resolution for the build.
 */
declare module '@storybook/angular/preset';
declare module '@storybook/angular/client';
declare module '@storybook/angular/client/config';
declare module '@storybook/angular/client/docs/config';
declare module '@storybook/angular/client/preview-prod';
declare module '@storybook/angular/builders/start-storybook';
declare module '@storybook/angular/builders/build-storybook';
