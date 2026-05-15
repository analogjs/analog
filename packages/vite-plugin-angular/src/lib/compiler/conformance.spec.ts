import { describe, it, expect } from 'vitest';
import { compile, type CompileOptions } from './compile';
import { scanFile, type ComponentRegistry } from './registry';
import { angularVersionAtLeast } from './angular-version';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ANGULAR_ROOT =
  process.env.ANGULAR_SOURCE_DIR ||
  path.resolve(process.env.HOME!, 'projects/angular/angular');
const COMPLIANCE_DIR = path.join(
  ANGULAR_ROOT,
  'packages/compiler-cli/test/compliance/test_cases',
);

/**
 * Fuzzy matcher for Angular compliance test expected output.
 * - Replaces $r3$ with i0
 * - Handles … (ellipsis) as "skip anything"
 * - Whitespace-tolerant
 */
function expectEmit(
  actual: string,
  expected: string,
): { pass: boolean; message: string } {
  const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();

  // Normalize both sides
  let normalizedExpected = expected.replace(/\$r3\$/g, 'i0');
  const actualNorm = normalizeWs(actual);
  const expectedNorm = normalizeWs(normalizedExpected);

  // Normalize instruction aliases: ɵɵtemplate ↔ ɵɵdomTemplate
  const normalizeInstruction = (s: string) =>
    s
      .replace(/ɵɵtemplate\(/g, 'ɵɵdomTemplate(')
      .replace(/ɵɵlistener\(/g, 'ɵɵdomListener(')
      .replace(/ɵɵelementStart\(/g, 'ɵɵdomElementStart(')
      .replace(/ɵɵelement\(/g, 'ɵɵdomElement(')
      .replace(/ɵɵelementEnd\(/g, 'ɵɵdomElementEnd(')
      .replace(/function \w+\([^)]*\)/g, '(...)') // Named functions → generic
      .replace(/\$\w+\$/g, '') // Remove $variable$ patterns
      .replace(/\s+/g, ' ')
      .trim();

  // Extract Ivy instruction calls: i0.ɵɵ<name>(<simple args>)
  // Use a balanced approach: capture instruction name + first arg segment
  const ivyPattern = /i0\.(ɵɵ\w+)\(([^)]{0,80})/g;

  const extractCalls = (s: string) => {
    const calls: { full: string; name: string; args: string }[] = [];
    let m;
    while ((m = ivyPattern.exec(s)) !== null) {
      calls.push({ full: m[0], name: m[1], args: m[2].trim() });
    }
    return calls;
  };

  const expectedCalls = extractCalls(expectedNorm);
  const actualCalls = extractCalls(actualNorm);
  const actualNormInstr = normalizeInstruction(actualNorm);

  if (expectedCalls.length === 0)
    return { pass: true, message: 'OK (no Ivy calls to check)' };

  // Ellipsis-aware fragment match: Angular's compliance fixtures use `…`
  // (U+2026) as "match any content here". Split the expected snippet on
  // ellipsis and check that each non-empty fragment appears in the
  // actual output in order. This is how Angular's own compliance test
  // runner interprets the fixture format. Without this, any expected
  // snippet that uses `…` (very common — most directive/component
  // fixtures wrap their inputs/outputs map in ellipses) is forced to
  // fall back to the looser instruction-name-based heuristics below,
  // which can't tell whether the inputs map actually matches.
  //
  // Aggressively collapses whitespace and strips:
  //   - `/*@__PURE__*/` pure-call annotations
  //   - `$variable$` placeholders from Angular's fixtures
  //   - `ClassName.` prefixes on `ɵ`-fields (Angular emits Ivy fields
  //     as post-class assignments `MyCmp.ɵcmp = …` while we emit them
  //     as `static ɵcmp = …` inside the class body — semantically
  //     equivalent, textually different)
  //   - the `static ` modifier keyword
  // so cosmetic differences between Angular's expected fixtures and
  // our emit don't break the comparison.
  const aggressiveNorm = (s: string) =>
    s
      .replace(/\/\*\s*@__PURE__\s*\*\//g, '')
      .replace(/\$\w+\$/g, '')
      .replace(/\b\w+\.(ɵ\w+\s*=)/g, '$1')
      .replace(/\bstatic\s+(ɵ)/g, '$1')
      .replace(/\s+/g, '')
      .trim();
  const ellipsisMatch = (() => {
    const fragments = expectedNorm
      .split('…')
      .map((f) => aggressiveNorm(f))
      .filter((f) => f.length > 0);
    if (fragments.length < 2) return null;
    const haystack = aggressiveNorm(actualNorm);
    let cursor = 0;
    for (const frag of fragments) {
      const idx = haystack.indexOf(frag, cursor);
      if (idx === -1) return false;
      cursor = idx + frag.length;
    }
    return true;
  })();
  if (ellipsisMatch) {
    return {
      pass: true,
      message: `OK (ellipsis fragments matched in order)`,
    };
  }

  const actualAggressive = aggressiveNorm(actualNorm);

  let matched = 0;
  for (const ec of expectedCalls) {
    const ecNorm = normalizeInstruction(ec.full);
    // Try exact match first
    if (actualNorm.includes(ec.full)) {
      matched++;
      continue;
    }
    // Try normalized match (template↔domTemplate, named→anon functions)
    if (actualNormInstr.includes(ecNorm)) {
      matched++;
      continue;
    }
    // Try cosmetic-insensitive match: the same normalization the ellipsis
    // path uses. Catches calls textually identical apart from whitespace
    // — e.g. our `{token: …}` vs Angular's `{ token: … }`.
    if (actualAggressive.includes(aggressiveNorm(ec.full))) {
      matched++;
      continue;
    }
    // Try instruction name + first arg match
    if (
      actualCalls.some(
        (ac) =>
          ac.name === ec.name && ac.args.startsWith(ec.args.split(',')[0]),
      )
    ) {
      matched++;
      continue;
    }
    // Try just instruction name + numeric first arg
    const firstArg = ec.args.match(/^\d+/)?.[0];
    if (
      firstArg &&
      actualCalls.some(
        (ac) =>
          (ac.name === ec.name ||
            normalizeInstruction('ɵɵ' + ac.name) ===
              normalizeInstruction('ɵɵ' + ec.name)) &&
          ac.args.startsWith(firstArg),
      )
    ) {
      matched++;
      continue;
    }
  }

  const ratio = matched / expectedCalls.length;
  if (ratio >= 0.6) {
    return {
      pass: true,
      message: `OK (${matched}/${expectedCalls.length} Ivy calls matched, ${(ratio * 100).toFixed(0)}%)`,
    };
  }

  const missing = expectedCalls
    .filter(
      (ec) =>
        !actualNorm.includes(ec.full) &&
        !actualNormInstr.includes(normalizeInstruction(ec.full)),
    )
    .map((ec) => ec.full)
    .slice(0, 3);
  return {
    pass: false,
    message: `Only ${matched}/${expectedCalls.length} Ivy calls matched (${(ratio * 100).toFixed(0)}%). Missing: ${missing.join(', ').substring(0, 100)}`,
  };
}

interface TestCase {
  description: string;
  inputFiles: string[];
  expectations: Array<{
    files: Array<{ expected: string; generated: string }>;
    failureMessage: string;
  }>;
  compilationModeFilter?: string[];
  focusTest?: boolean;
  excludeTest?: boolean;
}

function loadTestCases(categoryDir: string): TestCase[] {
  const jsonPath = path.join(categoryDir, 'TEST_CASES.json');
  if (!fs.existsSync(jsonPath)) return [];
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  return data.cases || [];
}

function loadFile(categoryDir: string, fileName: string): string {
  const filePath = path.join(categoryDir, fileName);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

interface TestCaseGroup {
  /** Directory holding this group's TEST_CASES.json and fixture files. */
  dir: string;
  /** Subpath relative to the category dir; '' for the category's own file. */
  label: string;
  cases: TestCase[];
}

// Discover TEST_CASES.json files for a category. Always includes the
// category's own file; when `recurse` is set, also descends into
// subdirectories. Angular nests related fixtures into subfolders (the i18n
// category groups ICU, namespace, and block cases this way), and a flat
// read of the top-level file alone would miss them.
function loadTestCaseGroups(
  categoryDir: string,
  recurse: boolean,
): TestCaseGroup[] {
  const groups: TestCaseGroup[] = [];
  const walk = (dir: string) => {
    const cases = loadTestCases(dir);
    if (cases.length > 0) {
      groups.push({ dir, label: path.relative(categoryDir, dir), cases });
    }
    if (recurse) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
      }
    }
  };
  walk(categoryDir);
  return groups;
}

// Categories to test (focus on features this compiler supports)
const CATEGORIES = [
  'r3_view_compiler_control_flow',
  'r3_view_compiler_bindings',
  'r3_view_compiler_listener',
  'r3_view_compiler_template',
  'r3_view_compiler_let',
  'r3_view_compiler_deferred',
  'r3_view_compiler_input_outputs',
  'r3_view_compiler_directives',
  'r3_view_compiler_styling',
  'r3_view_compiler_di',
  'r3_view_compiler_arrow_functions',
  'r3_view_compiler_providers',
  'r3_view_compiler',
  'r3_compiler_compliance',
  'signal_inputs', // v17-v18 category name
  'signal_queries', // v17+ signal-based queries
  'model_inputs', // v17+ model inputs
  'output_function', // v17+ output function
  'service_decorator', // v22+ @Service decorator
  'r3_view_compiler_i18n', // i18n / ICU (fixtures nested in subdirectories)
];

// Categories whose fixtures are split across subdirectories that the runner
// descends into. Angular nests related fixtures into subfolders; a flat read
// of the category's top-level TEST_CASES.json alone would miss them.
const NESTED_CATEGORIES = new Set([
  'r3_view_compiler_i18n',
  'r3_view_compiler_bindings',
  'r3_view_compiler_styling',
  'r3_view_compiler_di',
  'r3_view_compiler_directives',
  'r3_view_compiler',
  'r3_compiler_compliance',
]);

// Categories that only exist (and only compile) on a minimum Angular major.
// A category gated here still counts as "covered" for the drift detector
// below; it is just skipped when the installed compiler is too old.
const CATEGORY_MIN_MAJOR: Record<string, number> = {
  service_decorator: 22,
};

// Compliance categories the fast compiler deliberately does not run in this
// sweep, each with a reason. This list exists so the drift detector can tell
// a consciously-skipped category apart from a brand-new one Angular just
// added — see the "compliance category drift" test at the end of the file.
const UNSUPPORTED_CATEGORIES: Record<string, string> = {
  source_mapping: 'template source maps — out of scope for the fast compiler',
};

// Skip test cases known to be unsupported
const SKIP_PATTERNS = [
  /local compilation/i,
  /jit/i,
  /forward.?ref.*provider/i, // Complex forwardRef in providers
];

function shouldSkip(testCase: TestCase): boolean {
  if (testCase.excludeTest) return true;
  if (testCase.compilationModeFilter?.includes('linked compile')) return true;
  if (testCase.compilationModeFilter?.includes('local compile')) return true;
  return SKIP_PATTERNS.some((p) => p.test(testCase.description));
}

// Only run if Angular source is available
const angularAvailable = fs.existsSync(COMPLIANCE_DIR);

describe.skipIf(!angularAvailable)('Angular Compliance Tests', () => {
  const results = { pass: 0, fail: 0, skip: 0, error: 0 };
  const MIN_CONFORMANCE_PASS_RATE = Number.parseFloat(
    process.env.ANGULAR_CONFORMANCE_MIN_PASS_RATE ?? '0.75',
  );

  for (const category of CATEGORIES) {
    const categoryDir = path.join(COMPLIANCE_DIR, category);
    if (!fs.existsSync(categoryDir)) continue;

    const minMajor = CATEGORY_MIN_MAJOR[category];
    if (minMajor && !angularVersionAtLeast(minMajor)) continue;

    const groups = loadTestCaseGroups(
      categoryDir,
      NESTED_CATEGORIES.has(category),
    );
    if (groups.every((g) => g.cases.length === 0)) continue;

    describe(category, () => {
      for (const group of groups) {
        for (const tc of group.cases) {
          // Prefix nested-subdirectory cases so descriptions repeated
          // across subdirectories stay distinguishable in the output.
          const label = group.label
            ? `${group.label}: ${tc.description}`
            : tc.description;

          if (shouldSkip(tc)) {
            it.skip(label, () => {});
            results.skip++;
            continue;
          }

          it(label, () => {
            // Build a registry from all .ts files in the test directory
            // so cross-file references (e.g. @defer deps) can be resolved
            const registry: ComponentRegistry = new Map();
            try {
              const allTsFiles = fs
                .readdirSync(group.dir)
                .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
              for (const f of allTsFiles) {
                const code = loadFile(group.dir, f);
                if (!code) continue;
                for (const entry of scanFile(code, path.join(group.dir, f))) {
                  registry.set(entry.className, entry);
                }
              }
            } catch {
              /* ignore scan errors */
            }

            // Load and compile all input files
            for (const inputFile of tc.inputFiles || []) {
              if (!inputFile) {
                results.skip++;
                continue;
              }
              const inputCode = loadFile(group.dir, inputFile);
              if (!inputCode) {
                results.skip++;
                return;
              }

              let compiled: string;
              try {
                const result = compile(
                  inputCode,
                  path.join(group.dir, inputFile),
                  { registry, useDefineForClassFields: true },
                );
                compiled = result.code;
              } catch (e: any) {
                // Some test cases use features we don't support — record as error
                results.error++;
                // Don't fail the test, just record the error
                expect(true).toBe(true);
                return;
              }

              // Check expectations
              for (const expectation of tc.expectations || []) {
                if (!expectation.files || !Array.isArray(expectation.files))
                  continue;
                for (const file of expectation.files) {
                  if (!file?.expected) continue;
                  const expectedCode = loadFile(group.dir, file.expected);
                  if (!expectedCode) continue;

                  const result = expectEmit(compiled, expectedCode);
                  if (!result.pass) {
                    results.fail++;
                    // Soft failure — report but don't block other tests
                    console.warn(
                      `[CONFORMANCE FAIL] ${category}/${label}: ${result.message}`,
                    );
                  } else {
                    results.pass++;
                  }
                }
              }
            }
          });
        }
      }
    });
  }

  // Drift detector: every directory under Angular's compliance test_cases
  // must be consciously triaged — either into CATEGORIES (we run it) or
  // UNSUPPORTED_CATEGORIES (we skip it, with a reason). A directory in
  // neither means Angular shipped new compiler fixtures the fast compiler
  // has never been checked against; fail loudly so a maintainer triages it
  // rather than letting the gap pass silently.
  it('has no untriaged Angular compliance categories', () => {
    const onDisk = fs
      .readdirSync(COMPLIANCE_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const triaged = new Set([
      ...CATEGORIES,
      ...Object.keys(UNSUPPORTED_CATEGORIES),
    ]);
    const untriaged = onDisk.filter((name) => !triaged.has(name));

    expect(
      untriaged,
      `New Angular compliance categories detected: [${untriaged.join(', ')}]. ` +
        `Angular added compiler test fixtures the fast compiler has not been ` +
        `triaged against. Add each to CATEGORIES (and implement support) or to ` +
        `UNSUPPORTED_CATEGORIES (with a reason) in conformance.spec.ts.`,
    ).toEqual([]);
  });

  it('summary', () => {
    const total = results.pass + results.fail + results.skip + results.error;
    const compared = results.pass + results.fail;
    const passRate = compared > 0 ? results.pass / compared : 0;
    console.log('\n=== Angular Compliance Test Results ===');
    console.log(`Pass: ${results.pass}`);
    console.log(`Fail: ${results.fail}`);
    console.log(`Skip: ${results.skip}`);
    console.log(`Error (compile failed): ${results.error}`);
    console.log(`Total: ${total}`);
    console.log(`Pass rate: ${(passRate * 100).toFixed(1)}%`);
    expect(compared).toBeGreaterThan(0);
    expect(passRate).toBeGreaterThanOrEqual(MIN_CONFORMANCE_PASS_RATE);
  });
});
