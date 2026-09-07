#!/usr/bin/env node
// Compare two installed consumers with the same Angular/TypeScript/Vite pins.
// Usage: node compiler-benchmark.mjs --baseline=<directory> --candidate=<directory> --output=<report.json>
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    candidate: { type: 'string' },
    output: { type: 'string' },
  },
});
for (const key of ['baseline', 'candidate', 'output'])
  assert.ok(values[key], `--${key} is required`);
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
const records = { baseline: [], candidate: [] };
for (const name of Object.keys(records)) {
  await copyFile(
    join(
      dirname(fileURLToPath(import.meta.url)),
      'compiler-benchmark-worker.mjs',
    ),
    join(resolve(values[name]), 'compiler-benchmark-worker.mjs'),
  );
}
for (let sample = 0; sample < 5; sample++) {
  for (const name of sample % 2
    ? ['candidate', 'baseline']
    : ['baseline', 'candidate']) {
    const record = `${output}.${name}.${sample}.json`;
    execFileSync(
      process.execPath,
      ['--expose-gc', 'compiler-benchmark-worker.mjs', record],
      {
        cwd: resolve(values[name]),
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' },
      },
    );
    records[name].push(JSON.parse(await readFile(record, 'utf8')));
    console.log(`Completed ${name} sample ${sample + 1}/5`);
  }
}
for (const field of ['node', 'angular', 'typescript', 'vite', 'fastCompile'])
  assert.equal(
    records.baseline[0][field],
    records.candidate[0][field],
    `Matched ${field} versions`,
  );
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const metrics = {};
for (const [name, read] of Object.entries({
  importMs: (row) => row.importMs,
  importHeapBytes: (row) => row.importHeapBytes,
  constructMs: (row) => row.constructMs[0],
  coldBuildMs: (row) => row.buildMs[0],
  warmBuildMs: (row) => (row.buildMs[1] + row.buildMs[2]) / 2,
  retainedHeapBytes: (row) => row.heapAfterClose[2],
  retainedHeapGrowthBytes: (row) =>
    row.heapAfterClose[2] - row.heapAfterClose[0],
})) {
  const baseline = median(records.baseline.map(read));
  const candidate = median(records.candidate.map(read));
  metrics[name] = {
    baseline,
    candidate,
    baselineRange: [
      Math.min(...records.baseline.map(read)),
      Math.max(...records.baseline.map(read)),
    ],
    candidateRange: [
      Math.min(...records.candidate.map(read)),
      Math.max(...records.candidate.map(read)),
    ],
    changePercent: ((candidate - baseline) / baseline) * 100,
  };
}
await writeFile(
  output,
  JSON.stringify(
    {
      methodology:
        'Five fresh processes per revision, alternating order; 20 Angular components; three builds per process; explicit GC with all three plugin sets retained; warm filesystem and package caches; same machine and toolchain. No claim about peak RSS or production application latency.',
      metrics,
      records,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(metrics, null, 2));
