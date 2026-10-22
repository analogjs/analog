import { convertNxGenerator } from '@nx/devkit';

import setupAnalogGenerator from './generator';

/**
 * Angular CLI schematic wrapper for the Analog init/migrate generator.
 * Referenced by `generators.json#schematics.init.factory` so that
 * `ng generate @analogjs/platform:migrate` resolves through the
 * Angular schematics engine.
 */
export function initSchematic(
  options: Parameters<typeof setupAnalogGenerator>[1],
): ReturnType<ReturnType<typeof convertNxGenerator>> {
  return convertNxGenerator(setupAnalogGenerator)(options);
}
export default initSchematic;
