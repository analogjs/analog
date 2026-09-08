// Runs the runtime worker in prepared, isolated packed consumers.
// --root contains vite{6,6-latest,7,8}-{control,candidate}, with packed packages.
// node compiler-qualification-suite.mjs --root=<directory> --phase=paired|ssr-idle|soak
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execa } from 'execa';

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    phase: { type: 'string' },
    output: { type: 'string' },
    hmr: { type: 'boolean', default: false },
    'event-latency': { type: 'boolean', default: false },
    edits: { type: 'string', default: '10' },
    mode: { type: 'string', default: 'ngtsc' },
    manifest: { type: 'string' },
    // Kept for command compatibility. Existing evidence is never overwritten.
    resume: { type: 'boolean', default: true },
  },
});
assert.ok(values.root);
assert.ok(values.manifest, '--manifest is required');
assert.ok(['paired', 'ssr-idle', 'soak'].includes(values.phase));
assert.ok(['ngtsc', 'fast', 'api'].includes(values.mode));
assert.equal(process.version, 'v24.15.0');
const edits = Number(values.edits);
assert.ok(Number.isInteger(edits) && edits > 0);
const root = resolve(values.root);
const results = values.output ? resolve(values.output) : join(root, 'results');
await fs.mkdir(results, { recursive: true });
const inputManifest = JSON.parse(
  await fs.readFile(resolve(values.manifest), 'utf8'),
);
assert.equal(
  typeof inputManifest.cohort,
  'string',
  'manifest.cohort is required',
);
assert.equal(
  typeof inputManifest.runtimeRevision,
  'string',
  'manifest.runtimeRevision is required',
);
assert.ok(
  inputManifest.artifacts &&
    typeof inputManifest.artifacts.control === 'string' &&
    typeof inputManifest.artifacts.candidate === 'string',
  'manifest artifacts.control and artifacts.candidate are required',
);
const disposition = {
  phase: values.phase,
  mode: values.mode,
  resume: values.resume,
  startedAt: new Date().toISOString(),
  jobs: [],
};
const writeDisposition = () =>
  fs.writeFile(
    join(
      results,
      `qualification-disposition-${values.phase}-${values.mode}.json`,
    ),
    JSON.stringify(disposition, null, 2) + '\n',
  );
const worker = join(
  dirname(fileURLToPath(import.meta.url)),
  'compiler-runtime-qualification.mjs',
);
const cohortManifest = {
  input: inputManifest,
  protocol: {
    phase: values.phase,
    mode: values.mode,
    hmr: values.hmr,
    eventLatency: values['event-latency'],
    edits,
    node: process.version,
    workerSha256: createHash('sha256')
      .update(await fs.readFile(worker))
      .digest('hex'),
    ...(values.phase === 'soak'
      ? { updateWindowMs: 240000, workerTimeoutMs: 300000 }
      : {}),
  },
};
const cohortManifestPath = join(
  results,
  `qualification-manifest-${values.phase}-${values.mode}.json`,
);
try {
  const existing = JSON.parse(await fs.readFile(cohortManifestPath, 'utf8'));
  assert.deepEqual(existing, cohortManifest, 'cohort manifest must match');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  const existingEvidence = (await fs.readdir(results)).some(
    (name) => name.endsWith('.json') || name.endsWith('.log'),
  );
  assert.equal(
    existingEvidence,
    false,
    `A fresh output directory is required when ${cohortManifestPath} is absent`,
  );
  await fs.writeFile(
    cohortManifestPath,
    JSON.stringify(cohortManifest, null, 2) + '\n',
  );
}
for (const vite of [6, '6-latest', 7, 8])
  for (const side of ['control', 'candidate']) {
    await fs.copyFile(worker, join(root, `vite${vite}-${side}`, 'runtime.mjs'));
  }
async function run({
  vite,
  side,
  mode,
  sample,
  soak = false,
  ssrIdleMs,
  serverFirst = false,
  warmup = 'default',
}) {
  const idle = ssrIdleMs !== undefined;
  const name = idle
    ? `idle-${mode}-${ssrIdleMs}-${serverFirst ? 'server' : 'browser'}-${warmup}-${sample}`
    : `${soak ? 'soak' : 'paired'}-vite${vite}-${side}-${mode}-${sample}`;
  const output = join(results, `${name}.json`);
  const logPath = join(results, `${name}.log`);
  const expectedRecords = soak ? 60 : idle ? 5 : edits;
  const expectedWindowMs = 240000;
  const exists = async (file) => {
    try {
      await fs.access(file);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  };
  const outputExists = await exists(output);
  const logExists = await exists(logPath);
  if (outputExists || logExists) {
    let prior;
    try {
      prior = outputExists
        ? JSON.parse(await fs.readFile(output, 'utf8'))
        : undefined;
    } catch (error) {
      disposition.jobs.push({
        name,
        status: 'retained-incomplete',
        output,
        logPath,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    const complete =
      prior?.passed === true &&
      prior.records?.length === expectedRecords &&
      (!soak ||
        (prior.restarts?.length === 3 &&
          prior.drainedCallers === 100 &&
          prior.durationMs === expectedWindowMs &&
          prior.actualWindowMs >= expectedWindowMs - 1000));
    console.log(
      JSON.stringify({
        name,
        skipped: true,
        passed: complete,
        disposition: complete ? 'retained-pass' : 'retained-failure',
      }),
    );
    if (!complete) {
      disposition.jobs.push({
        name,
        status: outputExists ? 'retained-failure' : 'retained-incomplete',
        output,
        logPath,
      });
      throw new Error(
        `${name} has retained evidence; use a fresh output directory instead of replacing it`,
      );
    }
    disposition.jobs.push({ name, status: 'retained-pass', output, logPath });
    return;
  }
  const log = openSync(logPath, 'w');
  const args = [
    '--expose-gc',
    'runtime.mjs',
    `--output=${output}`,
    `--mode=${mode}`,
    `--label=${side}`,
  ];
  if (values['event-latency']) args.push('--event-latency');
  if (values.hmr && side === 'candidate')
    args.push('--expect-style-state', ...(soak ? ['--race-ssr'] : []));
  if (soak)
    args.push(
      '--components=100',
      '--edits=60',
      '--duration-ms=240000',
      '--restart-every=20',
      '--close-queued',
      // Vite 6.0's legacy ssrLoadModule retains its old runner on restart.
      // Its Environment Runner and 6.4.3's legacy loader cover both APIs.
      `--ssr-loader=${vite === 6 ? 'runner' : 'compat'}`,
    );
  else if (idle)
    args.push(
      '--components=100',
      '--edits=5',
      `--ssr-idle-ms=${ssrIdleMs}`,
      `--warmup=${warmup}`,
      ...(serverFirst ? ['--ssr-first'] : []),
    );
  else args.push('--components=1', `--edits=${edits}`);
  const started = Date.now();
  try {
    await execa(process.execPath, args, {
      cwd: join(root, `vite${vite}-${side}`),
      env: { ...process.env, NODE_ENV: 'development', VITEST: undefined },
      stdio: ['ignore', log, log],
      // The process limit includes setup and shutdown, so a five-minute cap
      // leaves no implicit fifteen-minute worker window behind.
      timeout: soak ? 300000 : 180000,
      killSignal: 'SIGKILL',
    });
    const result = JSON.parse(await fs.readFile(output, 'utf8'));
    assert.equal(result.passed, true, name);
    assert.equal(result.records.length, expectedRecords, name);
    assert.ok(Number.isFinite(result.shutdownMs), name);
    if (soak) {
      assert.equal(result.restarts.length, 3, name);
      assert.equal(result.drainedCallers, 100, name);
      assert.equal(result.durationMs, expectedWindowMs, name);
      assert.ok(result.actualWindowMs >= expectedWindowMs - 1000, name);
    }
    console.log(
      JSON.stringify({ name, passed: true, elapsedMs: Date.now() - started }),
    );
    disposition.jobs.push({
      name,
      status: 'passed',
      output,
      elapsedMs: Date.now() - started,
    });
  } catch (error) {
    disposition.jobs.push({
      name,
      status: 'failed',
      output,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    closeSync(log);
  }
}
if (values.phase === 'paired') {
  const failures = [];
  try {
    for (const vite of [6, '6-latest', 7, 8])
      for (let sample = 0; sample < 5; sample++) {
        for (const side of sample % 2
          ? ['candidate', 'control']
          : ['control', 'candidate']) {
          try {
            await run({ vite, side, mode: values.mode, sample });
          } catch (error) {
            failures.push(error);
          }
        }
      }
    if (failures.length)
      throw new AggregateError(
        failures,
        'Paired qualification retained or produced failed evidence',
      );
  } finally {
    await writeDisposition();
  }
} else if (values.phase === 'ssr-idle') {
  try {
    for (const ssrIdleMs of [0, 250, 1000])
      for (const serverFirst of [false, true])
        for (let sample = 0; sample < 3; sample++)
          for (const warmup of sample % 2
            ? ['default', 'off']
            : ['off', 'default']) {
            await run({
              vite: 8,
              side: 'candidate',
              mode: values.mode,
              sample,
              ssrIdleMs,
              serverFirst,
              warmup,
            });
          }
  } finally {
    await writeDisposition();
  }
} else {
  // Concurrent soak jobs qualify behavior and memory, not comparative latency.
  const jobs = [];
  for (const vite of [6, '6-latest', 8])
    for (const mode of ['ngtsc', 'fast', 'api']) {
      jobs.push(run({ vite, side: 'candidate', mode, sample: 0, soak: true }));
    }
  try {
    const outcomes = await Promise.allSettled(jobs);
    const failures = outcomes.filter((result) => result.status === 'rejected');
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        'Runtime soak qualification failed',
      );
  } finally {
    await writeDisposition();
  }
}
