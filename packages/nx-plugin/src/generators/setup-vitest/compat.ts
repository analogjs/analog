import { convertNxGenerator } from '@nx/devkit';

import setupVitestGenerator from './generator';

export default convertNxGenerator(setupVitestGenerator);
