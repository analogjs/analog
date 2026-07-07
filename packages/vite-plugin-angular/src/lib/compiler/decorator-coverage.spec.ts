import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ANGULAR_DECORATORS,
  COMPILABLE_DECORATORS,
  FIELD_DECORATORS,
} from './constants';

/**
 * Drift detectors against upstream `angular/angular`, mirroring the
 * compliance-category detector in `conformance.spec.ts` but at the decorator
 * level.
 *
 * The fast-compile path decides "is this an Angular file?" and which class
 * members to extract from fixed sets of decorator names. When Angular ships a
 * new decorator (e.g. `@Service` in v22) the relevant set must grow with it —
 * otherwise a class/member using only the new decorator is silently skipped.
 *
 * Angular declares class decorators as
 *   `export const X: XDecorator = makeDecorator(...)`
 * and member decorators (`@Input`, `@Output`, `@ViewChild`, ...) as
 *   `export const X: XDecorator = makePropDecorator(...)`
 * so the factory name selects which set we extract.
 */
const ANGULAR_ROOT =
  process.env.ANGULAR_SOURCE_DIR ||
  path.resolve(process.env.HOME ?? '', 'projects/angular/angular');
const CORE_SRC = path.join(ANGULAR_ROOT, 'packages/core/src');

function collectDeclarations(dir: string, factory: string): Set<string> {
  const re = new RegExp(
    `export const (\\w+)\\s*(?::[^=\\n]*)?=\\s*${factory}\\b`,
    'g',
  );
  const names = new Set<string>();
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.d.ts') &&
        !entry.name.endsWith('.spec.ts')
      ) {
        const code = fs.readFileSync(full, 'utf-8');
        if (!code.includes(factory)) continue;
        for (const match of code.matchAll(re)) names.add(match[1]);
      }
    }
  };
  walk(dir);
  return names;
}

describe.skipIf(!fs.existsSync(CORE_SRC))(
  'Angular decorator coverage (upstream drift)',
  () => {
    it('ANGULAR_DECORATORS covers every class decorator @angular/core ships', () => {
      const upstream = collectDeclarations(CORE_SRC, 'makeDecorator');

      // Guard against a vacuous pass: if the scan matched nothing the upstream
      // layout changed. `Component`/`Injectable` exist in every version.
      expect(
        upstream.has('Component') && upstream.has('Injectable'),
        `No class decorators found under ${CORE_SRC}; the upstream ` +
          `\`makeDecorator\` layout likely changed — update this detector.`,
      ).toBe(true);

      const missing = [...upstream].filter((d) => !ANGULAR_DECORATORS.has(d));
      expect(
        missing,
        `@angular/core declares class decorator(s) the fast compiler does not ` +
          `detect: [${missing.join(', ')}]. Add them to ANGULAR_DECORATORS in ` +
          `compiler/constants.ts — the fast-compile "is this Angular?" gate and ` +
          `the registry scan derive from it, so files using only those ` +
          `decorators would be treated as non-Angular and skipped.`,
      ).toEqual([]);
    });

    it('FIELD_DECORATORS covers every member decorator @angular/core ships', () => {
      const upstream = collectDeclarations(CORE_SRC, 'makePropDecorator');

      expect(
        upstream.has('Input') && upstream.has('Output'),
        `No member decorators found under ${CORE_SRC}; the upstream ` +
          `\`makePropDecorator\` layout likely changed — update this detector.`,
      ).toBe(true);

      const missing = [...upstream].filter((d) => !FIELD_DECORATORS.has(d));
      expect(
        missing,
        `@angular/core declares member decorator(s) the fast compiler does not ` +
          `extract: [${missing.join(', ')}]. Add them to FIELD_DECORATORS in ` +
          `compiler/constants.ts, or their host bindings / queries are dropped.`,
      ).toEqual([]);
    });
  },
);

describe('Angular decorator set consistency', () => {
  it('COMPILABLE_DECORATORS is a subset of ANGULAR_DECORATORS', () => {
    const notAngular = [...COMPILABLE_DECORATORS].filter(
      (d) => !ANGULAR_DECORATORS.has(d),
    );
    expect(notAngular).toEqual([]);
  });

  it('excludes @Injectable / @Service from COMPILABLE_DECORATORS (they self-register via ɵprov)', () => {
    expect(COMPILABLE_DECORATORS.has('Injectable')).toBe(false);
    expect(COMPILABLE_DECORATORS.has('Service')).toBe(false);
  });
});
