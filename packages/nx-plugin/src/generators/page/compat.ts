import { convertNxGenerator } from '@nx/devkit';

import analogPageGenerator from './generator';

/**
 * Angular CLI schematic wrapper for the Analog page generator.
 * Referenced by `generators.json#schematics.page.factory` so that
 * `ng generate @analogjs/platform:page` resolves through the
 * Angular schematics engine.
 */
export function pageSchematic(
  options: Parameters<typeof analogPageGenerator>[1],
): ReturnType<ReturnType<typeof convertNxGenerator>> {
  return convertNxGenerator(analogPageGenerator)(options);
}
export default pageSchematic;
