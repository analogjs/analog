import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'vite';
import {
  defineStylePipeline,
  defineStylePipelinePlugins,
  resolveStylePipelinePlugins,
} from './style-pipeline.js';

describe('style-pipeline', () => {
  it('keeps style-pipeline options strongly typed during config authoring', () => {
    const plugin: Plugin = { name: 'community-style-pipeline' };

    expect(
      defineStylePipeline({
        plugins: [plugin],
        angularPlugins: [],
      }),
    ).toEqual({
      plugins: [plugin],
      angularPlugins: [],
    });
  });

  it('keeps plugin arrays strongly typed during config authoring', () => {
    const plugin: Plugin = { name: 'community-style-pipeline' };

    expect(defineStylePipelinePlugins([plugin])).toEqual([plugin]);
  });

  it('resolves direct plugins and plugin factories with the workspace root', () => {
    const pluginA: Plugin = { name: 'plugin-a' };
    const pluginB: Plugin = { name: 'plugin-b' };
    const pluginC: Plugin = { name: 'plugin-c' };
    const factory = vi.fn(() => [pluginB, pluginC]);

    const resolved = resolveStylePipelinePlugins(
      {
        plugins: [pluginA, factory],
      },
      '/workspace',
    );

    expect(factory).toHaveBeenCalledWith({
      workspaceRoot: '/workspace',
    });
    expect(resolved).toEqual([pluginA, pluginB, pluginC]);
  });

  it('skips falsey plugin entries', () => {
    const plugin: Plugin = { name: 'plugin-a' };

    const resolved = resolveStylePipelinePlugins({
      plugins: [false, undefined, null, plugin],
    });

    expect(resolved).toEqual([plugin]);
  });
});
