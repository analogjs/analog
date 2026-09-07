// Five alternating fresh processes per side. Keep this separate from other builds/soaks.
// --root=<output> --control=<corrected-alpha.tgz> --pr=<prior-pr.tgz> --candidate=<optimized.tgz>
// Optional: --components=100 --vites=8.2.2 --samples=5 --edits=10
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, basename, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execa } from 'execa';

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    control: { type: 'string' },
    pr: { type: 'string' },
    candidate: { type: 'string' },
    components: { type: 'string', default: '1' },
    vites: { type: 'string', default: '6.0.0,7.3.6,8.2.2' },
    samples: { type: 'string', default: '5' },
    edits: { type: 'string', default: '10' },
  },
});
assert.equal(process.version, 'v24.15.0');
assert.ok(values.root && values.control && values.pr && values.candidate);
const components = Number(values.components),
  samples = Number(values.samples),
  edits = Number(values.edits);
for (const count of [components, samples, edits])
  assert.ok(Number.isSafeInteger(count) && count > 0);
const root = resolve(values.root);
await fs.mkdir(root, { recursive: true });
const worker = join(
  dirname(fileURLToPath(import.meta.url)),
  'compiler-runtime-qualification.mjs',
);
const sides = ['control', 'pr', 'candidate'];
const report = {
  node: process.version,
  components,
  samples,
  edits,
  packages: {},
  measurements: [],
};
const env = { ...process.env, NODE_ENV: 'development', VITEST: undefined };
env.PATH = `${dirname(process.execPath)}${delimiter}${process.env.PATH}`;
for (const side of sides) {
  const archive = resolve(values[side]);
  report.packages[side] = {
    file: basename(archive),
    sha256: createHash('sha256')
      .update(await fs.readFile(archive))
      .digest('hex'),
  };
}

for (const vite of values.vites.split(',')) {
  assert.ok(['6.0.0', '6.4.3', '7.3.6', '8.2.2'].includes(vite));
  for (const side of sides) {
    const cwd = join(root, `vite${vite}-${side}`);
    await fs.mkdir(cwd, { recursive: true });
    await fs.copyFile(worker, join(cwd, 'runtime.mjs'));
    await fs.writeFile(
      join(cwd, 'package.json'),
      JSON.stringify(
        {
          private: true,
          type: 'module',
          packageManager: 'pnpm@10.33.0',
          pnpm: {
            onlyBuiltDependencies: [
              'esbuild',
              '@parcel/watcher',
              'lmdb',
              'msgpackr-extract',
            ],
          },
          dependencies: {
            '@analogjs/vite-plugin-angular': `file:${resolve(values[side])}`,
            ...Object.fromEntries(
              [
                'build',
                'compiler',
                'compiler-cli',
                'core',
                'common',
                'platform-browser',
                'platform-server',
              ].map((name) => [`@angular/${name}`, '22.0.0']),
            ),
            vite,
            typescript: '6.0.2',
            'zone.js': '0.16.1',
            playwright: '1.59.1',
            rxjs: '7.8.2',
            tslib: '2.8.1',
          },
        },
        null,
        2,
      ),
    );
    const install = await execa(
      'pnpm',
      [
        'install',
        '--ignore-workspace',
        '--no-frozen-lockfile',
        '--prefer-offline',
      ],
      { cwd, env, all: true, reject: false },
    );
    await fs.writeFile(join(cwd, 'install.log'), install.all ?? install.stdout);
    assert.equal(install.exitCode, 0, `Install failed: ${cwd}/install.log`);
    if (side === 'control') {
      const browser = await execa(
        'pnpm',
        [
          'exec',
          'playwright',
          'install',
          'chromium',
          ...(process.env.CI ? ['--with-deps'] : []),
        ],
        { cwd, env, all: true, reject: false },
      );
      await fs.writeFile(join(cwd, 'browser-install.log'), browser.all);
      assert.equal(
        browser.exitCode,
        0,
        `Browser install failed: ${cwd}/browser-install.log`,
      );
    }
  }
  for (let sample = 0; sample < samples; sample++) {
    for (const side of sample % 2 ? [...sides].reverse() : sides) {
      const cwd = join(root, `vite${vite}-${side}`);
      const name = `${side}-${sample}`;
      const output = join(cwd, `${name}.json`);
      const result = await execa(
        process.execPath,
        [
          '--expose-gc',
          'runtime.mjs',
          `--output=${output}`,
          `--label=${side}`,
          `--components=${components}`,
          `--edits=${edits}`,
          '--refresh-ssr',
          ...(side === 'candidate' ? ['--expect-style-state'] : []),
        ],
        { cwd, env, all: true, reject: false, timeout: 180000 },
      );
      await fs.writeFile(join(cwd, `${name}.log`), result.all);
      assert.equal(result.exitCode, 0, `${cwd}/${name}.log`);
      const raw = await fs.readFile(output);
      const run = JSON.parse(raw);
      assert.equal(run.passed, true);
      assert.equal(run.records.length, edits);
      report.measurements.push({
        vite,
        side,
        sample,
        raw: `${basename(cwd)}/${name}.json`,
        sha256: createHash('sha256').update(raw).digest('hex'),
        records: run.records,
        initialSsr: run.initialSsr,
        shutdownMs: run.shutdownMs,
        memory: run.memory.filter((point) => point.stage !== 'sample'),
      });
      console.log(JSON.stringify({ vite, side, sample, passed: true }));
      await fs.writeFile(
        join(root, 'measurements.json'),
        JSON.stringify(report, null, 2),
      );
    }
  }
}
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
report.summary = values.vites.split(',').flatMap((vite) =>
  sides.map((side) => {
    const runs = report.measurements.filter(
      (run) => run.vite === vite && run.side === side,
    );
    const records = runs.flatMap((run) => run.records);
    return {
      vite,
      side,
      templateMedianMs: percentile(
        runs.map((run) => mean(run.records.map((record) => record.templateMs))),
        0.5,
      ),
      templateP95Ms: percentile(
        records.map((record) => record.templateMs),
        0.95,
      ),
      cssMedianMs: percentile(
        runs.map((run) =>
          mean(run.records.map((record) => record.stylesheetMs)),
        ),
        0.5,
      ),
      cssP95Ms: percentile(
        records.map((record) => record.stylesheetMs),
        0.95,
      ),
      statePreserved: records.filter((record) => record.styleStatePreserved)
        .length,
      edits: records.length,
      firstSsrMedianMs: percentile(
        runs.map((run) => run.initialSsr.ms),
        0.5,
      ),
      editedSsrMedianMs: percentile(
        runs.map((run) => mean(run.records.map((record) => record.ssr.ms))),
        0.5,
      ),
    };
  }),
);
await fs.writeFile(
  join(root, 'measurements.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report.summary, null, 2));
