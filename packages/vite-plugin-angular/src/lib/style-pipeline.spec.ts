import { describe, expect, it, vi } from 'vitest';
import { AnalogStylesheetRegistry } from './stylesheet-registry.js';
import * as debug from './utils/debug.js';
import {
  type AngularStylePipelineOptions,
  type AngularStylePipelinePlugin,
  configureStylePipelineRegistry,
  stylePipelinePreprocessorFromPlugins,
} from './style-pipeline.js';

describe('angular style-pipeline hooks', () => {
  it('keeps angular style-pipeline options strongly typed during config authoring', () => {
    const plugins: AngularStylePipelinePlugin[] = [
      {
        name: 'plugin-a',
      },
    ];
    const options: AngularStylePipelineOptions = { plugins };

    expect(options).toEqual({
      plugins,
    });
  });

  it('chains stylesheet preprocessors from community plugins', () => {
    const preprocess = stylePipelinePreprocessorFromPlugins({
      plugins: [
        {
          name: 'plugin-a',
          preprocessStylesheet: (code) => `${code}\n/* a */`,
        },
        {
          name: 'plugin-b',
          preprocessStylesheet: (code, context) =>
            `${code}\n/* ${context.filename} */`,
        },
      ],
    });

    expect(
      preprocess?.('.demo { color: red; }', '/project/demo.css', {
        filename: '/project/demo.css',
        inline: false,
      }),
    ).toEqual({
      code: '.demo { color: red; }\n/* a */\n/* /project/demo.css */',
      dependencies: [],
      diagnostics: [],
      tags: [],
    });
  });

  it('merges structured stylesheet metadata from community plugins', () => {
    const preprocess = stylePipelinePreprocessorFromPlugins({
      plugins: [
        {
          name: 'plugin-a',
          preprocessStylesheet: (code) => ({
            code: `${code}\n/* a */`,
            dependencies: ['virtual:brandos/tailwind.css'],
            diagnostics: [
              {
                severity: 'warning',
                code: 'tailwind-reference',
                message: 'Injected shared Tailwind bridge reference.',
              },
            ],
            tags: ['tailwind'],
          }),
        },
        {
          name: 'plugin-b',
          preprocessStylesheet: (code, context) => ({
            code: `${code}\n/* ${context.filename} */`,
            dependencies: [
              {
                id: '/tokens/brand.json',
                kind: 'token',
              },
            ],
            tags: ['tokens'],
          }),
        },
      ],
    });

    expect(
      preprocess?.('.demo { color: red; }', '/project/demo.css', {
        filename: '/project/demo.css',
        inline: false,
      }),
    ).toEqual({
      code: '.demo { color: red; }\n/* a */\n/* /project/demo.css */',
      dependencies: [
        {
          id: 'virtual:brandos/tailwind.css',
        },
        {
          id: '/tokens/brand.json',
          kind: 'token',
        },
      ],
      diagnostics: [
        {
          severity: 'warning',
          code: 'tailwind-reference',
          message: 'Injected shared Tailwind bridge reference.',
        },
      ],
      tags: ['tailwind', 'tokens'],
    });
  });

  it('logs when community preprocessors are skipped because Angular did not provide stylesheet context', () => {
    const logSpy = vi.spyOn(debug, 'debugStylePipeline');
    const preprocess = stylePipelinePreprocessorFromPlugins({
      plugins: [
        {
          name: 'plugin-a',
          preprocessStylesheet: (code) => `${code}\n/* a */`,
        },
      ],
    });

    expect(preprocess?.('.demo { color: red; }', '/project/demo.css')).toBe(
      '.demo { color: red; }',
    );
    expect(logSpy).toHaveBeenCalledWith(
      'skipping community stylesheet preprocessors because Angular did not provide a stylesheet context',
      {
        filename: '/project/demo.css',
      },
    );
  });

  it('passes the stylesheet registry to community plugins', () => {
    const configureRegistry = vi.fn();
    const registry = new AnalogStylesheetRegistry();

    configureStylePipelineRegistry(
      {
        plugins: [
          {
            name: 'plugin-a',
            configureStylesheetRegistry: configureRegistry,
          },
        ],
      },
      registry,
      {
        workspaceRoot: '/workspace',
      },
    );

    expect(configureRegistry).toHaveBeenCalledWith(registry, {
      workspaceRoot: '/workspace',
    });
  });
});
