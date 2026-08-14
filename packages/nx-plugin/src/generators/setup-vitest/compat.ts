import { convertNxGenerator } from '@nx/devkit';

import setupVitestGenerator from './generator';

/**
 * Angular CLI schematic wrapper for the Vitest setup generator.
 * Referenced by `generators.json#schematics.setup-vitest.factory` so that
 * `ng generate @analogjs/platform:setup-vitest` resolves through the
 * Angular schematics engine.
 */
export const setupVitestSchematic: ReturnType<typeof convertNxGenerator> =
  convertNxGenerator(setupVitestGenerator) as ReturnType<
    typeof convertNxGenerator
  >;
export default setupVitestSchematic;
