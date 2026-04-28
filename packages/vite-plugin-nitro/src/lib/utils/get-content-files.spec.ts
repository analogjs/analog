import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getMatchingContentFilesWithFrontMatter } from './get-content-files';

describe('getMatchingContentFilesWithFrontMatter', () => {
  let workspaceRoot: string;
  const rootDir = '.';
  const contentDir = '/src/content/docs';

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-content-'));
    mkdirSync(join(workspaceRoot, 'src/content/docs/erste-schritte'), {
      recursive: true,
    });
    mkdirSync(join(workspaceRoot, 'src/content/docs/assets'), {
      recursive: true,
    });
    writeFileSync(
      join(workspaceRoot, 'src/content/docs/intro.md'),
      '---\ntitle: Intro\n---\n# Intro',
    );
    writeFileSync(
      join(workspaceRoot, 'src/content/docs/erste-schritte/willkommen.md'),
      '---\ntitle: Willkommen\n---\n# Willkommen',
    );
    writeFileSync(
      join(workspaceRoot, 'src/content/docs/assets/hochladen.md'),
      '---\ntitle: Hochladen\n---\n# Hochladen',
    );
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns only top-level files by default', () => {
    const files = getMatchingContentFilesWithFrontMatter(
      workspaceRoot,
      rootDir,
      contentDir,
    );

    expect(files.map((f) => f.name).sort()).toEqual(['intro']);
  });

  it('returns nested files when recursive is enabled', () => {
    const files = getMatchingContentFilesWithFrontMatter(
      workspaceRoot,
      rootDir,
      contentDir,
      true,
    );

    expect(files.map((f) => f.name).sort()).toEqual([
      'hochladen',
      'intro',
      'willkommen',
    ]);
  });

  it('exposes the directory relative to contentDir as relativePath', () => {
    const files = getMatchingContentFilesWithFrontMatter(
      workspaceRoot,
      rootDir,
      contentDir,
      true,
    );

    const byName = Object.fromEntries(files.map((f) => [f.name, f]));
    expect(byName['intro'].relativePath).toBe('');
    expect(byName['willkommen'].relativePath).toBe('erste-schritte');
    expect(byName['hochladen'].relativePath).toBe('assets');
  });
});
