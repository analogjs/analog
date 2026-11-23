import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizePath } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComponentScanner } from './component-scanner';
import { findFastCompileApi, type FastCompileApi } from './fast-compile-api';
import { fastCompilePlugin } from './fast-compile-plugin';

function buildPlugin(
  overrides: Partial<Parameters<typeof fastCompilePlugin>[0]> = {},
) {
  return fastCompilePlugin({
    tsconfigGetter: () => 'tsconfig.json',
    workspaceRoot: '/workspace',
    inlineStylesExtension: 'css',
    jit: false,
    liveReload: false,
    isTest: false,
    isAstroIntegration: false,
    ...overrides,
  });
}

/** A source format whose modules are already TypeScript, for testing the seam. */
const customFormat = {
  name: 'custom',
  test: (path: string) => path.endsWith('.custom'),
  toScanSource: (code: string) => code,
};

describe('fast compile API', () => {
  let api: FastCompileApi;
  let dir: string;

  beforeEach(() => {
    api = findFastCompileApi([{}, buildPlugin()])!;
    dir = normalizePath(mkdtempSync(join(tmpdir(), 'fast-compile-api-')));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is found among Vite plugins', () => {
    expect(api).toBeDefined();
    expect(findFastCompileApi([{}, { api: {} }])).toBeUndefined();
  });

  it('compiles TypeScript produced for a module of another format', async () => {
    const mapToSource = vi.fn((map) => ({
      ...(typeof map === 'string' ? JSON.parse(map) : map),
      sources: ['counter.custom'],
    }));
    const result = await api.compile(
      `import { Component } from '@angular/core';
@Component({ selector: 'app-counter', template: '<p>count</p>' })
export class Counter {}
`,
      `${dir}/counter.custom`,
      { resolve: async () => null, mapToSource },
    );

    expect(result?.code).toContain('ɵɵdefineComponent');
    expect(result?.code).not.toContain('@Component');
    expect(mapToSource).toHaveBeenCalledOnce();
    expect(result?.map).toMatchObject({ sources: ['counter.custom'] });
  });

  it('scans modules of a registered format into the component registry', async () => {
    api.registerSourceFormat(customFormat);
    const badge = `${dir}/badge.custom`;
    writeFileSync(
      badge,
      `import { Component } from '@angular/core';
@Component({ selector: 'x-badge', template: '' })
export class Badge {}
`,
    );

    expect(api.resolveSelector('Badge')).toBeNull();
    await api.scanImports(
      ['./badge.custom'],
      `${dir}/app.custom`,
      async () => ({
        id: badge,
      }),
    );
    expect(api.resolveSelector('Badge')).toBe('x-badge');
  });

  it('scans imported packages from their declarations', async () => {
    expect(api.resolveSelector('RouterOutlet')).toBeNull();
    await api.scanImports(
      ['@angular/router'],
      `${dir}/app.custom`,
      async () => null,
    );
    expect(api.resolveSelector('RouterOutlet')).toBe('router-outlet');
    expect(
      api.resolveSelector(
        'RouterOutlet',
        '@angular/router',
        `${dir}/app.custom`,
      ),
    ).toBe('router-outlet');
  });

  it('resolves same-named components per imported module without colliding', async () => {
    api.registerSourceFormat(customFormat);
    const cardA = `${dir}/card-a.custom`;
    const cardB = `${dir}/card-b.custom`;
    const app = `${dir}/app.custom`;
    writeFileSync(
      cardA,
      `import { Component } from '@angular/core';
@Component({ selector: 'x-card-a', template: '' })
export class Card {}
`,
    );
    writeFileSync(
      cardB,
      `import { Component } from '@angular/core';
@Component({ selector: 'x-card-b', template: '' })
export class Card {}
`,
    );

    const files: Record<string, string> = {
      './card-a.custom': cardA,
      './card-b.custom': cardB,
    };
    await api.scanImports(Object.keys(files), app, async (spec) =>
      files[spec] ? { id: files[spec] } : null,
    );

    expect(api.resolveSelector('Card', './card-a.custom', app)).toBe(
      'x-card-a',
    );
    expect(api.resolveSelector('Card', './card-b.custom', app)).toBe(
      'x-card-b',
    );
    expect(['x-card-a', 'x-card-b']).toContain(api.resolveSelector('Card'));
  });

  it('resolves default exports by module and respects direct target over barrels', async () => {
    api.registerSourceFormat(customFormat);
    const inlineDefault = `${dir}/inline-default.custom`;
    const separateDefault = `${dir}/separate-default.custom`;
    const namedOnly = `${dir}/named-only.custom`;
    const barrel = `${dir}/barrel.custom`;
    const app = `${dir}/app.custom`;
    writeFileSync(
      inlineDefault,
      `import { Component } from '@angular/core';
@Component({ selector: 'x-inline-default', template: '' })
export default class InlineCard {}
`,
    );
    writeFileSync(
      separateDefault,
      `import { Component } from '@angular/core';
@Component({ selector: 'x-separate-default', template: '' })
class SeparateCard {}
export default SeparateCard;
`,
    );
    writeFileSync(
      namedOnly,
      `import { Component } from '@angular/core';
@Component({ selector: 'x-named-only', template: '' })
export class NamedOnly {}
`,
    );
    writeFileSync(
      barrel,
      `export { default } from './inline-default.custom';\n`,
    );

    const files: Record<string, string> = {
      './inline-default.custom': inlineDefault,
      './separate-default.custom': separateDefault,
      './named-only.custom': namedOnly,
      './barrel.custom': barrel,
    };
    await api.scanImports(Object.keys(files), app, async (spec) =>
      files[spec] ? { id: files[spec] } : null,
    );

    expect(api.resolveSelector('default', './inline-default.custom', app)).toBe(
      'x-inline-default',
    );
    expect(
      api.resolveSelector('default', './separate-default.custom', app),
    ).toBe('x-separate-default');
    expect(api.resolveSelector('default', './barrel.custom', app)).toBe(
      'x-inline-default',
    );
    expect(
      api.resolveSelector('default', './named-only.custom', app),
    ).toBeNull();
  });

  it('resolves aliased, default, star, local-aliased, and cyclic barrel re-exports by exported binding', async () => {
    api.registerSourceFormat(customFormat);
    const cardA = `${dir}/a.custom`;
    const cardB = `${dir}/b.custom`;
    const starTarget = `${dir}/star.custom`;
    const localAlias = `${dir}/local-alias.custom`;
    const cycleA = `${dir}/cycle-a.custom`;
    const cycleB = `${dir}/cycle-b.custom`;
    const barrel = `${dir}/barrel.custom`;
    const app = `${dir}/app.custom`;
    writeFileSync(
      cardA,
      `import { Component } from '@angular/core';
@Component({ selector: 'app-card-a', template: '' })
export default class Card {}
export { Card };
`,
    );
    writeFileSync(
      cardB,
      `import { Component } from '@angular/core';
@Component({ selector: 'app-card-b', template: '' })
export class Card {}
`,
    );
    writeFileSync(
      starTarget,
      `import { Component } from '@angular/core';
@Component({ selector: 'app-star-badge', template: '' })
export class StarBadge {}
`,
    );
    writeFileSync(
      localAlias,
      `import { Component } from '@angular/core';
@Component({ selector: 'app-local-alias', template: '' })
class InternalPanel {}
export { InternalPanel as PublicPanel };
`,
    );
    writeFileSync(cycleA, `export * from './cycle-b.custom';\n`);
    writeFileSync(cycleB, `export * from './cycle-a.custom';\n`);
    writeFileSync(
      barrel,
      `export { Card as Other, default as CustomCard } from './a.custom';
export { Card } from './b.custom';
export * from './star.custom';
export * from './local-alias.custom';
export * from './cycle-a.custom';
`,
    );

    const files: Record<string, string> = {
      './a.custom': cardA,
      './b.custom': cardB,
      './star.custom': starTarget,
      './local-alias.custom': localAlias,
      './cycle-a.custom': cycleA,
      './cycle-b.custom': cycleB,
      './barrel.custom': barrel,
    };
    await api.scanImports(['./barrel.custom'], app, async (spec) =>
      files[spec] ? { id: files[spec] } : null,
    );

    expect(api.resolveSelector('Other', './barrel.custom', app)).toBe(
      'app-card-a',
    );
    expect(api.resolveSelector('Card', './barrel.custom', app)).toBe(
      'app-card-b',
    );
    expect(api.resolveSelector('CustomCard', './barrel.custom', app)).toBe(
      'app-card-a',
    );
    expect(api.resolveSelector('StarBadge', './barrel.custom', app)).toBe(
      'app-star-badge',
    );
    expect(api.resolveSelector('PublicPanel', './barrel.custom', app)).toBe(
      'app-local-alias',
    );
    expect(api.resolveSelector('Missing', './barrel.custom', app)).toBeNull();
  });

  it('restores another file entry in global registry when a duplicate class file is invalidated', async () => {
    const scanner = new ComponentScanner();
    scanner.registerSourceFormat(customFormat);
    const cardA = `${dir}/a.custom`;
    const cardB = `${dir}/b.custom`;
    const app = `${dir}/app.custom`;
    writeFileSync(
      cardA,
      `import { Component } from '@angular/core';
@Component({ selector: 'x-card-a', template: '' })
export class Card {}
`,
    );
    writeFileSync(
      cardB,
      `import { Component } from '@angular/core';
@Component({ selector: 'x-card-b', template: '' })
export class Card {}
`,
    );

    const files: Record<string, string> = {
      './a.custom': cardA,
      './b.custom': cardB,
    };
    const resolve = async (spec: string) =>
      files[spec] ? { id: files[spec] } : null;
    await scanner.scanImports(['./a.custom'], app, resolve);
    await scanner.scanImports(['./b.custom'], app, resolve);
    expect(scanner.lookupSelector('Card')).toBe('x-card-a');
    expect(scanner.entriesOf(cardA)).toHaveLength(1);
    expect(scanner.entriesOf(cardB)).toHaveLength(1);

    scanner.invalidate(cardA);
    expect(scanner.entriesOf(cardA)).toHaveLength(0);
    expect(scanner.lookupSelector('Card')).toBe('x-card-b');
    expect(
      scanner.lookupSelector('Card', [], {
        moduleSpecifier: './b.custom',
        containingFile: app,
      }),
    ).toBe('x-card-b');
  });

  it('cleans up stale entries during non-overwriting recordFileEntries', () => {
    const scanner = new ComponentScanner();
    const fileA = `${dir}/a.ts`;
    const fileB = `${dir}/b.ts`;
    scanner.recordFileEntries(fileA, [
      {
        selector: 'app-card-a',
        kind: 'component',
        fileName: fileA,
        className: 'Card',
      },
      {
        selector: 'app-old',
        kind: 'component',
        fileName: fileA,
        className: 'OldComp',
      },
    ]);
    scanner.recordFileEntries(fileB, [
      {
        selector: 'app-card-b',
        kind: 'component',
        fileName: fileB,
        className: 'Card',
      },
    ]);

    expect(scanner.lookupSelector('Card')).toBe('app-card-a');
    expect(scanner.lookupSelector('OldComp')).toBe('app-old');

    // Re-recording fileA without OldComp removes OldComp from the global registry.
    scanner.recordFileEntries(fileA, [
      {
        selector: 'app-card-a',
        kind: 'component',
        fileName: fileA,
        className: 'Card',
      },
    ]);
    expect(scanner.lookupSelector('OldComp')).toBeNull();
    expect(scanner.lookupSelector('Card')).toBe('app-card-a');

    // Re-recording fileA as empty removes fileA's entry and promotes fileB's Card.
    scanner.recordFileEntries(fileA, []);
    expect(scanner.entriesOf(fileA)).toEqual([]);
    expect(scanner.lookupSelector('Card')).toBe('app-card-b');
  });

  it('binds aliased, default, same-named, and local component metadata during fastCompile.compile', async () => {
    const partialApi = findFastCompileApi([
      {},
      buildPlugin({ fastCompileMode: 'partial' }),
    ])!;
    partialApi.registerSourceFormat(customFormat);
    const cardA = `${dir}/a.custom`;
    const cardB = `${dir}/b.custom`;
    const defaultCard = `${dir}/default.custom`;
    const page = `${dir}/page.custom`;

    writeFileSync(
      cardA,
      `import { Component } from '@angular/core';
@Component({ selector: 'app-card-a', template: '' })
export class Card {}
`,
    );
    writeFileSync(
      cardB,
      `import { Component } from '@angular/core';
@Component({ selector: 'app-card-b', template: '' })
export class Card {}
`,
    );
    writeFileSync(
      defaultCard,
      `import { Component } from '@angular/core';
@Component({ selector: 'app-default-card', template: '' })
export default class DefaultImpl {}
`,
    );

    const files: Record<string, string> = {
      './a.custom': cardA,
      './b.custom': cardB,
      './default.custom': defaultCard,
    };
    const resolve = async (spec: string) =>
      files[spec] ? { id: files[spec] } : null;

    const compiled = await partialApi.compile(
      `import { Component } from '@angular/core';
import { Card as ACard } from './a.custom';
import { Card as BCard } from './b.custom';
import DefaultCard from './default.custom';

@Component({ selector: 'app-local-card', template: '' })
class Card {}

@Component({
  selector: 'app-page',
  imports: [ACard, BCard, DefaultCard, Card],
  template: '<app-card-a></app-card-a><app-card-b></app-card-b><app-default-card></app-default-card><app-local-card></app-local-card>',
})
export class Page {}
`,
      page,
      { resolve },
    );

    expect(compiled?.code).toBeDefined();
    expect(compiled?.code).not.toContain('_unresolved-');
    expect(compiled?.code).toMatch(
      /type:\s*(?:i0\.forwardRef\(\(\)\s*=>\s*)?ACard\)?,\s*selector:\s*["']app-card-a["']/,
    );
    expect(compiled?.code).toMatch(
      /type:\s*(?:i0\.forwardRef\(\(\)\s*=>\s*)?BCard\)?,\s*selector:\s*["']app-card-b["']/,
    );
    expect(compiled?.code).toMatch(
      /type:\s*(?:i0\.forwardRef\(\(\)\s*=>\s*)?DefaultCard\)?,\s*selector:\s*["']app-default-card["']/,
    );
    expect(compiled?.code).toMatch(
      /type:\s*(?:i0\.forwardRef\(\(\)\s*=>\s*)?Card\)?,\s*selector:\s*["']app-local-card["']/,
    );
  });

  it('ignores imports of unregistered formats', async () => {
    const other = `${dir}/other.unknown`;
    writeFileSync(
      other,
      `import { Component } from '@angular/core';
@Component({ selector: 'x-other', template: '' })
export class Other {}
`,
    );
    await api.scanImports(
      ['./other.unknown'],
      `${dir}/app.custom`,
      async () => ({
        id: other,
      }),
    );
    expect(api.resolveSelector('Other')).toBeNull();
  });
});
