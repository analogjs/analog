import { describe, expect, it } from 'vitest';
import {
  defineAngularStylePipeline,
  defineAngularStylePipelinePlugins,
  defineStylePipeline,
  defineStylePipelinePlugins,
  resolveStylePipelinePlugins,
} from './style-pipeline.js';
import * as stylePipelineEntry from './style-pipeline.js';

describe('style-pipeline entry point', () => {
  it('re-exports the style pipeline helpers', () => {
    expect(stylePipelineEntry.defineAngularStylePipeline).toBe(
      defineAngularStylePipeline,
    );
    expect(stylePipelineEntry.defineAngularStylePipelinePlugins).toBe(
      defineAngularStylePipelinePlugins,
    );
    expect(stylePipelineEntry.defineStylePipeline).toBe(defineStylePipeline);
    expect(stylePipelineEntry.defineStylePipelinePlugins).toBe(
      defineStylePipelinePlugins,
    );
    expect(stylePipelineEntry.resolveStylePipelinePlugins).toBe(
      resolveStylePipelinePlugins,
    );
  });
});
