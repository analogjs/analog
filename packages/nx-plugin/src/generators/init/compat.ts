import { convertNxGenerator } from '@nx/devkit';

import setupAnalogGenerator from './generator';

const compat = convertNxGenerator(setupAnalogGenerator);
export default compat;
