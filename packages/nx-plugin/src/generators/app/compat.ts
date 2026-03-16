import { convertNxGenerator } from '@nx/devkit';
import generator from './generator';

const compat = convertNxGenerator(generator);
export default compat;
