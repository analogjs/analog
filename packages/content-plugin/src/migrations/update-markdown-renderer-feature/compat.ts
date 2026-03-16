import { convertNxGenerator } from '@nx/devkit';
import updateMarkdownRendererFeature from './update-markdown-renderer-feature';

const _default: ReturnType<typeof convertNxGenerator> = convertNxGenerator(
  updateMarkdownRendererFeature,
);
export default _default;
