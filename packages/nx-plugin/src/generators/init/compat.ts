import { convertNxGenerator } from '@nx/devkit';

import setupAnalogGenerator from './generator';

const compat: ReturnType<typeof convertNxGenerator> = convertNxGenerator(
  setupAnalogGenerator,
) as ReturnType<typeof convertNxGenerator>;
export default compat;
