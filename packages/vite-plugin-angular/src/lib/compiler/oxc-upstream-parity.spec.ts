/**
 * Upstream-anchored parity: compare both engines' output against
 * Angular's own compliance test goldens at
 * `packages/compiler-cli/test/compliance/test_cases/`.
 *
 * Unlike `oxc-parity.spec.ts` (which only checks the TS and OXC
 * engines agree with each other), this spec asks the stricter
 * question: *does each engine match the upstream Angular compiler's
 * full-mode emit?* When both engines diverge from upstream in the
 * same way they would silently pass the engine-vs-engine suite — so
 * this catches drift the other suite can't see.
 *
 * The harness reads `<fixture>.ts` (input) and `<fixture>.js` (golden)
 * straight from a local Angular checkout, then runs both compilers on
 * the input and matches each output against the golden via the loose
 * `matchUpstream` matcher (a slim port of Angular's
 * `compliance/test_helpers/expect_emit.ts`).
 *
 * The Angular checkout path is configurable via `ANGULAR_SRC` env var;
 * defaults to `~/projects/angular/angular`. If the path doesn't exist
 * the suite skips entirely so this file is safe to commit.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { compile as tsCompile } from './compile.js';
import { oxcTransform } from './oxc-engine.js';
import { matchUpstream } from './__upstream_match__.js';

const ANGULAR_SRC =
  process.env['ANGULAR_SRC'] || join(homedir(), 'projects/angular/angular');
const COMPLIANCE_BASE = join(
  ANGULAR_SRC,
  'packages/compiler-cli/test/compliance/test_cases',
);
const upstreamAvailable = existsSync(COMPLIANCE_BASE);

const OXC_CTX: Parameters<typeof oxcTransform>[2] = {
  resolvedConfig: {
    root: process.cwd(),
    command: 'build',
    mode: 'production',
    isProduction: true,
    css: {},
  } as never,
  inlineStylesExtension: 'css',
  liveReload: false,
  watchMode: false,
};

interface UpstreamFixture {
  /** Friendly fixture name for the test report. */
  name: string;
  /** Relative path under `test_cases/` containing the inputs and golden. */
  dir: string;
  /** Input `.ts` filename (within `dir`). */
  input: string;
  /** Golden `.js` filename (within `dir`). */
  golden: string;
  /**
   * If set, both engines are expected to fail this fixture's match
   * (TS engine and/or OXC engine ≠ upstream). The test then asserts
   * the failure with a `console.warn` rather than fail-stopping CI.
   * Useful for tracking known-divergent emit while we file PRs.
   */
  expectedDivergent?: { ts?: boolean; oxc?: boolean };
}

/**
 * Picks of Angular compliance fixtures that:
 *  - exercise modern emit (signal APIs, control flow, queries)
 *  - have a self-contained `.js` golden (no separate consts file)
 *  - don't depend on i18n helpers our matcher doesn't implement
 *
 * Anchored to Angular v22.1.0-next.0 (the local checkout). Re-runs
 * against a newer checkout may need adjustments — emit isn't a stable
 * public contract.
 */
const FIXTURES: UpstreamFixture[] = [
  // ─── PASSING (both engines match upstream Angular v22 emit) ───
  {
    name: 'signal_inputs / input_component_definition',
    dir: 'signal_inputs',
    input: 'input_component_definition.ts',
    golden: 'input_component_definition.js',
  },
  {
    name: 'output_function / output_in_component',
    dir: 'output_function',
    input: 'output_in_component.ts',
    golden: 'output_in_component.js',
  },
  {
    name: 'model_inputs / model_component_definition',
    dir: 'model_inputs',
    input: 'model_component_definition.ts',
    golden: 'model_component_definition.js',
  },

  // ─── Previously divergent — TS engine closed by the
  //     `emitDistinctChangesOnly` + named-function-expression fixes
  //     in metadata.ts and js-emitter.ts. OXC engine still diverges
  //     on the released `@oxc-angular/vite@0.0.30`: queries emit as
  //     separate statements rather than chained
  //     (`ɵɵviewQuerySignal(...)(...)`) and the const-table indices
  //     for content vs view queries are swapped. Both gaps are
  //     closed in voidzero-dev/oxc-angular-compiler#323 but it
  //     hasn't shipped to npm yet — flip back to `oxc: false` once
  //     the next OXC release lands. ───
  {
    name: 'signal_queries / query_in_component',
    dir: 'signal_queries',
    input: 'query_in_component.ts',
    golden: 'query_in_component.js',
    expectedDivergent: { ts: false, oxc: true },
  },
  {
    name: 'control_flow / basic_for',
    dir: 'r3_view_compiler_control_flow',
    input: 'basic_for.ts',
    golden: 'basic_for_template.js',
  },

  {
    name: 'control_flow / basic_if',
    dir: 'r3_view_compiler_control_flow',
    input: 'basic_if.ts',
    golden: 'basic_if_template.js',
  },
];

interface EngineRun {
  code?: string;
  error?: Error;
}

function compileTs(code: string, fileName: string): EngineRun {
  try {
    return { code: tsCompile(code, fileName).code };
  } catch (e) {
    return { error: e as Error };
  }
}

async function compileOxc(code: string, fileName: string): Promise<EngineRun> {
  try {
    return { code: (await oxcTransform(code, fileName, OXC_CTX)).code };
  } catch (e) {
    return { error: e as Error };
  }
}

describe.skipIf(!upstreamAvailable)(
  'Upstream parity vs Angular compliance goldens',
  () => {
    for (const fx of FIXTURES) {
      it(fx.name, async () => {
        const fixtureDir = join(COMPLIANCE_BASE, fx.dir);
        const inputPath = join(fixtureDir, fx.input);
        const goldenPath = join(fixtureDir, fx.golden);

        const source = readFileSync(inputPath, 'utf-8');
        const expected = readFileSync(goldenPath, 'utf-8');

        const ts = compileTs(source, inputPath);
        const oxc = await compileOxc(source, inputPath);

        if (ts.error) {
          return expect.fail(
            `TS engine threw on ${fx.input}: ${ts.error.message}`,
          );
        }
        if (oxc.error) {
          return expect.fail(
            `OXC engine threw on ${fx.input}: ${oxc.error.message}`,
          );
        }

        const tsMatch = matchUpstream(ts.code!, expected);
        const oxcMatch = matchUpstream(oxc.code!, expected);

        const tsShouldDiverge = !!fx.expectedDivergent?.ts;
        const oxcShouldDiverge = !!fx.expectedDivergent?.oxc;

        // Use soft so both engines' results show in one run.
        if (tsShouldDiverge) {
          expect
            .soft(
              tsMatch.ok,
              `TS engine unexpectedly matched upstream for ${fx.name} (expected divergent)`,
            )
            .toBe(false);
        } else {
          expect
            .soft(
              tsMatch.ok,
              `TS engine ≠ upstream for ${fx.name}: ${tsMatch.reason}`,
            )
            .toBe(true);
        }

        if (oxcShouldDiverge) {
          expect
            .soft(
              oxcMatch.ok,
              `OXC engine unexpectedly matched upstream for ${fx.name} (expected divergent)`,
            )
            .toBe(false);
        } else {
          expect
            .soft(
              oxcMatch.ok,
              `OXC engine ≠ upstream for ${fx.name}: ${oxcMatch.reason}`,
            )
            .toBe(true);
        }
      });
    }
  },
);
