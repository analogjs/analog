// Runs the runtime worker in prepared, isolated packed consumers.
// --root contains vite{6,6-latest,7,8}-{control,candidate}, with packed packages.
// node compiler-qualification-suite.mjs --root=<directory> --phase=paired|ssr-idle|soak
import assert from 'node:assert/strict';
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
  },
});
assert.ok(values.root);
assert.ok(['paired', 'ssr-idle', 'soak'].includes(values.phase));
assert.ok(['ngtsc', 'fast', 'api'].includes(values.mode));
assert.equal(process.version, 'v24.15.0');
const edits = Number(values.edits);
assert.ok(Number.isInteger(edits) && edits > 0);
const root = resolve(values.root);
const results = values.output ? resolve(values.output) : join(root, 'results');
await fs.mkdir(results, { recursive: true });
const worker = join(
  dirname(fileURLToPath(import.meta.url)),
  'compiler-runtime-qualification.mjs',
);
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
  const log = openSync(join(results, `${name}.log`), 'w');
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
      '--duration-ms=900000',
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
      timeout: soak ? 1200000 : 180000,
      killSignal: 'SIGKILL',
    });
    const result = JSON.parse(await fs.readFile(output, 'utf8'));
    assert.equal(result.passed, true, name);
    assert.equal(result.records.length, soak ? 60 : idle ? 5 : edits, name);
    assert.ok(Number.isFinite(result.shutdownMs), name);
    if (soak) {
      assert.equal(result.restarts.length, 3, name);
      assert.equal(result.drainedCallers, 100, name);
      assert.ok(result.actualWindowMs >= 899000, name);
    }
    console.log(
      JSON.stringify({ name, passed: true, elapsedMs: Date.now() - started }),
    );
  } finally {
    closeSync(log);
  }
}
if (values.phase === 'paired') {
  for (const vite of [6, '6-latest', 7, 8])
    for (let sample = 0; sample < 5; sample++) {
      for (const side of sample % 2
        ? ['candidate', 'control']
        : ['control', 'candidate']) {
        await run({ vite, side, mode: values.mode, sample });
      }
    }
} else if (values.phase === 'ssr-idle') {
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
} else {
  // Concurrent soak jobs qualify behavior and memory, not comparative latency.
  const jobs = [];
  for (const vite of [6, '6-latest', 8])
    for (const mode of ['ngtsc', 'fast', 'api']) {
      jobs.push(run({ vite, side: 'candidate', mode, sample: 0, soak: true }));
    }
  const outcomes = await Promise.allSettled(jobs);
  const failures = outcomes.filter((result) => result.status === 'rejected');
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      'Runtime soak qualification failed',
    );
}
