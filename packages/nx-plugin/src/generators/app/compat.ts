import { convertNxGenerator } from '@nx/devkit';
import generator from './generator';

const compat: ReturnType<typeof convertNxGenerator> =
  convertNxGenerator(generator);
export default compat;
