import { convertNxGenerator } from '@nx/devkit';

import setupVitestGenerator from './generator';

const compat: ReturnType<typeof convertNxGenerator> = convertNxGenerator(
  setupVitestGenerator,
) as ReturnType<typeof convertNxGenerator>;
export default compat;
