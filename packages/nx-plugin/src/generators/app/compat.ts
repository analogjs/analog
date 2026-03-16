import { convertNxGenerator } from '@nx/devkit';
import generator from './generator';

const compat: ReturnType<typeof convertNxGenerator> = convertNxGenerator(
  generator,
) as ReturnType<typeof convertNxGenerator>;
export default compat;
