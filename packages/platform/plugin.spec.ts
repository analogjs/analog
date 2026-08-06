import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  readFileSync(new URL(file, import.meta.url), 'utf-8');

describe('agent plugin', () => {
  it('has a spec-conformant plugin.json', () => {
    const manifest = JSON.parse(read('./plugin.json'));

    expect(manifest.$schema).toBe(
      'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    );
    expect(manifest.name).toMatch(
      /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/,
    );
  });

  it('exposes the analogjs skill with required frontmatter', () => {
    const skill = read('./skills/analogjs/SKILL.md');
    const [, frontmatter] = skill.split('---\n');

    expect(frontmatter).toContain('name: analogjs');
    expect(frontmatter).toMatch(/description: .+/);
  });

  it('documents the same APIs as AGENTS.md', () => {
    const skill = read('./skills/analogjs/SKILL.md');

    for (const api of [
      'RouteMeta',
      'inject(ActivatedRoute)',
      'defineEventHandler',
      'injectLoad',
      'injectServerFn',
      'injectContent',
    ]) {
      expect(skill).toContain(api);
    }
  });
});
