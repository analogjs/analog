import { convertNxGenerator } from '@nx/devkit';

import setupAnalogGenerator from './generator';

/**
 * Angular CLI schematic wrapper for the Analog init/migrate generator.
 * Referenced by `generators.json#schematics.init.factory` so that
 * `ng generate @analogjs/platform:migrate` resolves through the
 * Angular schematics engine.
 */
export const initSchematic: ReturnType<typeof convertNxGenerator> =
  convertNxGenerator(setupAnalogGenerator) as ReturnType<
    typeof convertNxGenerator
  >;
export default initSchematic;
