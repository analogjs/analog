import { convertNxGenerator } from '@nx/devkit';

import setupVitestGenerator from './generator';

const compat = convertNxGenerator(setupVitestGenerator);
export default compat;
