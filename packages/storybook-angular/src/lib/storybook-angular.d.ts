/**
 * Ambient declarations for @storybook/angular subpath imports that do NOT ship types.
 * Official @storybook/angular does not provide .d.ts files for builders, preset, client, etc.
 * Tracked in various GitHub issues since ~2018–2023.
 * See also: https://github.com/storybookjs/storybook/issues?q=is%3Aissue+angular+types+is%3Aopen
 */

declare module '@storybook/angular/builders/build-storybook';
declare module '@storybook/angular/builders/start-storybook';
declare module '@storybook/angular/preset';
declare module '@storybook/angular/client';
declare module '@storybook/angular/client/config';
