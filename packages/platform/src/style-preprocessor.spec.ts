import { describe, expect, it } from 'vitest';
import {
  composeStylePreprocessors,
  normalizeStylesheetDependencies,
  normalizeStylesheetTransformResult,
} from './style-preprocessor.js';
import * as stylePreprocessorEntry from './style-preprocessor.js';

describe('style-preprocessor entry point', () => {
  it('re-exports the stylesheet preprocessor helpers', () => {
    expect(stylePreprocessorEntry.composeStylePreprocessors).toBe(
      composeStylePreprocessors,
    );
    expect(stylePreprocessorEntry.normalizeStylesheetDependencies).toBe(
      normalizeStylesheetDependencies,
    );
    expect(stylePreprocessorEntry.normalizeStylesheetTransformResult).toBe(
      normalizeStylesheetTransformResult,
    );
  });

  it('normalizes shorthand dependency strings into structured entries', () => {
    expect(
      normalizeStylesheetTransformResult(
        {
          code: '.demo { color: red; }',
          dependencies: ['virtual:brandos/tailwind.css'],
        },
        '.demo { color: blue; }',
      ),
    ).toEqual({
      code: '.demo { color: red; }',
      dependencies: [{ id: 'virtual:brandos/tailwind.css' }],
      diagnostics: [],
      tags: [],
    });
  });
});
