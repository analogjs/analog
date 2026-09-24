import { describe, expect, it } from 'vitest';
import { preprocessCSS, resolveConfig } from 'vite';

import { releaseCssPreprocessorWorkers } from './css-preprocessor-workers.js';

function preprocessorChildHandles() {
  const getHandles = (
    process as NodeJS.Process & { _getActiveHandles?: () => any[] }
  )._getActiveHandles;
  const handles =
    typeof getHandles === 'function' ? getHandles.call(process) : [];
  return handles.filter((handle) => {
    const haystack = `${handle?.spawnfile ?? ''} ${(
      handle?.spawnargs ?? []
    ).join(' ')}`;
    return /sass-embedded|dart-sass|sass\.snapshot/i.test(haystack);
  });
}

describe('releaseCssPreprocessorWorkers', () => {
  it('is a no-op when no preprocessor processes are active', () => {
    expect(() => releaseCssPreprocessorWorkers()).not.toThrow();
  });

  it('unrefs the fallback Sass worker spawned by preprocessCSS', async () => {
    const config = await resolveConfig(
      { configFile: false, logLevel: 'silent' },
      'build',
    );
    // Different object identity forces Vite's unmanaged fallback worker.
    const cacheMissConfig = Object.create(config);

    await preprocessCSS(
      '$color: red; :host { color: $color; }',
      'component.scss',
      cacheMissConfig,
    );

    expect(preprocessorChildHandles().length).toBeGreaterThan(0);

    releaseCssPreprocessorWorkers();

    expect(preprocessorChildHandles()).toHaveLength(0);
  });
});
