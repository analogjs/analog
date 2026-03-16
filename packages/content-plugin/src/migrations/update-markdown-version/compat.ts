import { convertNxGenerator } from '@nx/devkit';
import updateMarkdownVersion from './update-markdown-version';

const _default: ReturnType<typeof convertNxGenerator> = convertNxGenerator(
  updateMarkdownVersion,
);
export default _default;
