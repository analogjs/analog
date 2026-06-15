import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ANGULAR_DECORATORS } from './constants';

/**
 * Drift detector against upstream `angular/angular`, mirroring the
 * compliance-category detector in `conformance.spec.ts` but at the decorator
 * level.
 *
 * The fast-compile path decides "is this an Angular file?" from a fixed set of
 * class decorators ({@link ANGULAR_DECORATORS}). When Angular ships a new class
 * decorator (e.g. `@Service` in v22) the set must grow with it — otherwise a
 * file whose only Angular decorator is the new one is treated as non-Angular,
 * skipped by the compiler, and silently falls back to JIT at runtime.
 *
 * Angular declares class decorators as
 *   `export const X: XDecorator = makeDecorator(...)`
 * and member decorators (`@Input`, `@Output`, ...) via `makePropDecorator`.
 * Only the former trigger Ivy class compilation, so only the former belong in
 * `ANGULAR_DECORATORS`.
 */
const ANGULAR_ROOT =
  process.env.ANGULAR_SOURCE_DIR ||
  path.resolve(process.env.HOME ?? '', 'projects/angular/angular');
const CORE_SRC = path.join(ANGULAR_ROOT, 'packages/core/src');

const CLASS_DECORATOR_RE =
  /export const (\w+)\s*(?::[^=\n]*)?=\s*makeDecorator\b/g;

function collectClassDecorators(dir: string): Set<string> {
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
        if (!code.includes('makeDecorator')) continue;
        for (const match of code.matchAll(CLASS_DECORATOR_RE)) {
          names.add(match[1]);
        }
      }
    }
  };
  walk(dir);
  return names;
}

describe.skipIf(!fs.existsSync(CORE_SRC))(
  'Angular class decorator coverage',
  () => {
    it('ANGULAR_DECORATORS covers every class decorator @angular/core ships', () => {
      const upstream = collectClassDecorators(CORE_SRC);

      // Guard against a vacuous pass: if the upstream layout changed and the
      // scan matched nothing, fail loudly instead of silently "covering" an
      // empty set. `Component`/`Injectable` exist in every supported version.
      expect(
        upstream.has('Component') && upstream.has('Injectable'),
        `Found no Angular class decorators under ${CORE_SRC}; the upstream ` +
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
  },
);
