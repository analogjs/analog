import { convertNxGenerator } from '@nx/devkit';

import analogPageGenerator from './generator';

/**
 * Angular CLI schematic wrapper for the Analog page generator.
 * Referenced by `generators.json#schematics.page.factory` so that
 * `ng generate @analogjs/platform:page` resolves through the
 * Angular schematics engine.
 */
export const pageSchematic: ReturnType<typeof convertNxGenerator> =
  convertNxGenerator(analogPageGenerator) as ReturnType<
    typeof convertNxGenerator
  >;
export default pageSchematic;
