import { convertNxGenerator } from '@nx/devkit';
import generator from './generator';

/**
 * Angular CLI schematic wrapper for the Analog application generator.
 * Referenced by `generators.json#schematics.application.factory` so that
 * `ng generate @analogjs/platform:application` resolves through the
 * Angular schematics engine (which uses named exports, not default).
 */
export const applicationSchematic: ReturnType<typeof convertNxGenerator> =
  convertNxGenerator(generator) as ReturnType<typeof convertNxGenerator>;
export default applicationSchematic;
